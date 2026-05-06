import { resolveAddressToSuinsViaRpc, SuinsRpcError } from '@t2000/engine';
import type { Contact } from './contact-schema';
import { pickAudricHandleFromReverseNames } from './audric-handle-helpers';

/**
 * SPEC 10 D.4 — Lazy reverse-SuiNS backfill for the audricUsername field.
 *
 * For each contact whose `audricUsername` field is unset (undefined) OR
 * `null` (previously checked with no Audric leaf — re-check is cheap and
 * self-corrects if a SuiNS leaf was registered after our last pass), do
 * a reverse SuiNS lookup against `resolvedAddress` and pick the first
 * `*.audric.sui` leaf if any.
 *
 * Persistence: if any contact's `audricUsername` value changed (string
 * appeared, string changed, or string→null on a leaf release), the
 * caller should write the result back. Stable rows (e.g. null → null
 * after recheck) don't trigger persistence.
 *
 * Concurrency: 4 parallel RPC calls per batch — empirical sweet spot
 * for Sui RPC providers. Tested at this rate against BlockVision
 * without throttling. Bumping higher risks 429s under multi-user load.
 *
 * Error policy: per-row failures are caught (logged + left untouched).
 * One bad address must not block the rest of the list. The next
 * GET/backfill triggers a retry.
 *
 * NOT a cron — runs on demand via `POST /api/user/preferences/contacts/
 * backfill`. The hook (`useContacts`) triggers it once per session
 * after the initial GET sees any unchecked contacts. Keeps GET latency
 * low (preferences don't block on N RPC calls); the badges populate
 * ~250-500ms after page load.
 *
 * Why no `audricUsernameCheckedAt` field: stale-recheck of `null` rows
 * costs ~50ms per RPC × ~5 contacts = ~250ms per backfill call. With
 * one backfill per session, the cost is acceptable. Adding a checkedAt
 * marker would save those 250ms but requires a schema field + write-on-
 * recheck. Defer until per-user contact counts grow large enough that
 * the cost matters.
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

function needsCheck(c: Contact): boolean {
  // Never checked (undefined) OR previously checked with no result (null).
  // String values are skipped — once we've matched a leaf, don't re-RPC.
  return typeof c.audricUsername !== 'string';
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

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { idx, handle } = r.value;
        if (handle) hits += 1;
        const prev = next[idx].audricUsername;
        // Normalize "no result" to literal null (vs undefined) so the
        // schema serializer keeps the field present — distinguishes
        // "checked, none" from "never checked" on the next GET.
        const newVal: string | null = handle ?? null;
        if (prev !== newVal) {
          next[idx] = { ...next[idx], audricUsername: newVal };
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
        console.warn(`[contact-backfill] reverse-SuiNS failed: ${detail}`);
      }
    }
  }

  return { contacts: next, changed, attempted, hits, errored };
}
