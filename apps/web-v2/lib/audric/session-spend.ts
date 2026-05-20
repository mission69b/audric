/**
 * # Per-session cumulative auto-executed USD spend ledger.
 *
 * Backs `ToolContext.sessionSpendUsd`, which the engine's
 * `resolvePermissionTier` consults to enforce the daily autonomous
 * spend cap (per `safeguards-defense-in-depth.mdc` — cumulative daily
 * spend > `autonomousDailyLimit` downgrades any `auto` to `confirm` as
 * a runtime safety net).
 *
 * ## Storage
 *
 * One key per session — `session_spend:<sessionId>` (24h TTL). Matches
 * the canonical apps/web shape byte-for-byte (`apps/web/lib/engine/session-spend.ts`)
 * so the same Upstash database can be queried from either app and the
 * keys collide consistently. Shared Vercel env vars across projects
 * → shared Upstash → shared ledger semantics during the v0.7c → v0.7d
 * transition window.
 *
 * ## Failure mode: fail-OPEN
 *
 * If Upstash is down:
 * - `getSessionSpend` returns `0` → engine sees no accumulated spend
 *   → daily-cap downgrade rule doesn't engage this turn
 * - `incrementSessionSpend` swallows the error → the increment is lost
 *
 * The trade-off prefers user availability over a strict spend ceiling
 * during transient infra incidents. The engine's per-call tier check
 * (`resolvePermissionTier(operation, amountUsd, config)`) is still in
 * effect — the daily-cap rule is the SECOND line of defense, not the
 * first. A single missed increment doesn't open the floodgates.
 *
 * ## v0.7d note (Group E READ-side wire — 2026-05-21)
 *
 * Web-v2's chat route reads via `getSessionSpend(sessionId)` when
 * constructing `ToolContext`. The INCREMENT side (`incrementSessionSpend`
 * call after a successful write tool execution) is wired in apps/web's
 * engine factory via `EngineConfig.onAutoExecuted` — that path doesn't
 * exist in web-v2 because we use `Experimental_Agent` directly, not
 * `AISDKEngine.submitMessage()`. Today this is a no-op because web-v2
 * has zero auto-tier writes in production (all confirm-tier; user
 * always taps). The increment site is a Phase 1+ wire-up — see TODO
 * marker in `app/api/chat/route.ts` `translateChunk` → `tool-result`
 * case.
 */
import { upstash } from "@/lib/upstash";

const PREFIX = "session_spend:";
const DEFAULT_TTL_SEC = 24 * 60 * 60;

function key(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

export async function getSessionSpend(sessionId: string): Promise<number> {
  if (!upstash) {
    return 0;
  }
  try {
    const val = await upstash.get<string | number>(key(sessionId));
    if (val == null) {
      return 0;
    }
    const n = typeof val === "number" ? val : Number(val);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.warn("[session-spend] getSessionSpend failed (fail-open):", err);
    return 0;
  }
}

export async function incrementSessionSpend(
  sessionId: string,
  usd: number
): Promise<void> {
  if (!(Number.isFinite(usd) && usd > 0)) {
    return;
  }
  if (!upstash) {
    return;
  }
  try {
    const fresh = await upstash.incrbyfloat(key(sessionId), usd);
    if (typeof fresh === "number" && fresh === usd) {
      await upstash.expire(key(sessionId), DEFAULT_TTL_SEC);
    }
  } catch (err) {
    console.warn(
      "[session-spend] incrementSessionSpend failed (fail-open):",
      err
    );
  }
}
