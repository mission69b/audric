import { resolveAddressToSuinsViaRpc, SuinsRpcError } from '@t2000/engine';
import type { Contact } from './contact-schema';
import { pickAudricHandleFromReverseNames } from './audric-handle-helpers';

/**
 * SPEC 10 D.4 — Lazy reverse-SuiNS backfill for the audricUsername field.
 *
 * For each contact whose `audricUsername` field is unset (undefined) OR
 * `null` AND hasn't been checked in the last 24h, do a reverse SuiNS
 * lookup against `resolvedAddress` and pick the first `*.audric.sui`
 * leaf if any. The 24h re-check window covers the "user registered an
 * Audric handle after we last looked" case while bounding the noise
 * floor.
 *
 * Persistence: if any contact's `audricUsername` value changed (string
 * appeared, string changed, or string→null on a leaf release), OR the
 * `audricUsernameCheckedAt` timestamp was stamped on this pass, the
 * caller should write the result back. Stable rows (e.g. null → null
 * after a check, with the same checkedAt window) don't re-RPC at all.
 *
 * Concurrency: 4 parallel RPC calls per batch — empirical sweet spot
 * for Sui RPC providers. Tested at this rate against BlockVision
 * without throttling. Bumping higher risks 429s under multi-user load.
 *
 * Error policy: per-row failures are caught (logged + leaf STAMPED with
 * a checkedAt timestamp + audricUsername=null so the next 24h's worth
 * of backfill calls SKIP this row — single-warning-per-day instead of
 * single-warning-per-session). One bad address must not block the rest
 * of the list.
 *
 * NOT a cron — runs on demand via `POST /api/user/preferences/contacts/
 * backfill`. The hook (`useContacts`) triggers it once per session
 * after the initial GET sees any unchecked contacts. Keeps GET latency
 * low (preferences don't block on N RPC calls); the badges populate
 * ~250-500ms after page load.
 *
 * [S18-F8 / vercel-logs L6] The 24h re-check window was added to
 * eliminate "Name has expired" log noise — pre-fix, every session
 * re-RPC'd every null/errored contact and emitted the same console.warn
 * for addresses with expired old SuiNS handles. 30+ identical warnings
 * over 12h for the same handle was typical. Post-fix, the same address
 * generates at most 1 warning per 24h window per user.
 */

interface BackfillOpts {
  suiRpcUrl?: string;
  signal?: AbortSignal;
  /** Concurrency cap for parallel RPCs. Defaults to 4. */
  concurrency?: number;
}

interface BackfillResult {
  contacts: Contact[];
  /** True if at least one contact's audricUsername field changed value. */
  changed: boolean;
  /** Number of reverse-SuiNS RPCs attempted. */
  attempted: number;
  /** Number that produced an Audric leaf hit. */
  hits: number;
  /** Number that errored (logged; not retried inline). */
  errored: number;
}

const DEFAULT_CONCURRENCY = 4;

/**
 * [S18-F8] How long a `null` (or errored) check is considered fresh
 * before we re-RPC. 24h balances "newly-registered Audric handles
 * appear within a day" vs "stop re-checking expired addresses every
 * session". Sized to roughly match a typical user's session cadence.
 */
const RECHECK_TTL_MS = 24 * 60 * 60 * 1000;

function needsCheck(c: Contact): boolean {
  // Confirmed match — never re-RPC. The handle could in theory release,
  // but reverse-SuiNS releases are rare and the cost of a stale string
  // (one bad badge) is much lower than the cost of re-checking every
  // confirmed contact every session.
  if (typeof c.audricUsername === 'string') return false;

  // [S18-F8] Within the 24h re-check window AND we previously got a
  // clean result (null) or a stamped error (also null) — skip. The
  // checkedAt timestamp is set on EVERY backfill outcome (success, no
  // result, OR error), so any contact with a stamp is in this window.
  if (c.audricUsernameCheckedAt) {
    const checkedAt = Date.parse(c.audricUsernameCheckedAt);
    if (Number.isFinite(checkedAt) && Date.now() - checkedAt < RECHECK_TTL_MS) {
      return false;
    }
  }

  // Never checked (undefined) OR stale window expired — recheck.
  return true;
}

export async function backfillAudricUsernames(
  contacts: Contact[],
  opts: BackfillOpts = {},
): Promise<BackfillResult> {
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const todo: number[] = [];
  contacts.forEach((c, i) => {
    if (needsCheck(c)) todo.push(i);
  });

  if (todo.length === 0) {
    return { contacts, changed: false, attempted: 0, hits: 0, errored: 0 };
  }

  const next = [...contacts];
  let changed = false;
  let attempted = 0;
  let hits = 0;
  let errored = 0;

  for (let i = 0; i < todo.length; i += concurrency) {
    if (opts.signal?.aborted) break;
    const batch = todo.slice(i, i + concurrency);
    attempted += batch.length;

    const results = await Promise.allSettled(
      batch.map(async (idx) => {
        const names = await resolveAddressToSuinsViaRpc(next[idx].resolvedAddress, {
          suiRpcUrl: opts.suiRpcUrl,
          signal: opts.signal,
        });
        return { idx, handle: pickAudricHandleFromReverseNames(names) };
      }),
    );

    // [S18-F8] checkedAt is stamped on EVERY outcome (success, no-result,
    // OR error) so the next backfill within RECHECK_TTL_MS skips this row.
    // Errored rows are stamped with audricUsername=null (same shape as
    // "checked, no result") — semantically: "we tried, no leaf for now".
    const checkedAtNow = new Date().toISOString();

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { idx, handle } = r.value;
        if (handle) hits += 1;
        const prev = next[idx].audricUsername;
        // Normalize "no result" to literal null (vs undefined) so the
        // schema serializer keeps the field present — distinguishes
        // "checked, none" from "never checked" on the next GET.
        const newVal: string | null = handle ?? null;
        // Always update checkedAt; only set audricUsername if changed.
        next[idx] = {
          ...next[idx],
          audricUsername: newVal,
          audricUsernameCheckedAt: checkedAtNow,
        };
        if (prev !== newVal) {
          changed = true;
        } else {
          // Even if audricUsername didn't change, the checkedAt stamp did
          // — caller needs to persist so we don't re-RPC next session.
          changed = true;
        }
      } else {
        errored += 1;
        const detail =
          r.reason instanceof SuinsRpcError
            ? r.reason.message
            : r.reason instanceof Error
              ? r.reason.message
              : 'unknown';
        // Find the contact index from the failed promise — promises are
        // returned in the same order as the batch array.
        const failedBatchIdx = results.indexOf(r);
        const contactIdx = batch[failedBatchIdx];
        console.warn(`[contact-backfill] reverse-SuiNS failed: ${detail}`);
        // [S18-F8] Stamp checkedAt + null audricUsername for errored rows
        // so the next 24h's worth of backfills skip this address. Without
        // the stamp we re-RPC'd every session and re-emitted the same warn
        // (30+ "Name has expired" warns / 12h for the same handle pre-fix).
        next[contactIdx] = {
          ...next[contactIdx],
          audricUsername: null,
          audricUsernameCheckedAt: checkedAtNow,
        };
        changed = true;
      }
    }
  }

  return { contacts: next, changed, attempted, hits, errored };
}
