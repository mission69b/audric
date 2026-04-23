import { redis } from '@/lib/redis';

/**
 * [v1.4] Cumulative auto-executed USD spend per session.
 *
 * The engine forwards this number into `ToolContext.sessionSpendUsd`, which
 * `resolvePermissionTier` consults to enforce the daily autonomous spend cap.
 *
 * Storage:  one key per session — `session_spend:<sessionId>` (24 h TTL).
 * Failure mode: fail-OPEN. If Redis is down, getter returns 0 and incrementer
 * swallows the error. The trade-off is preferring user availability over a
 * strict spend ceiling for a transient infra incident; the engine's per-call
 * tier check is still in effect.
 */

const PREFIX = 'session_spend:';
const DEFAULT_TTL_SEC = 24 * 60 * 60;

function key(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

export async function getSessionSpend(sessionId: string): Promise<number> {
  try {
    const val = await redis.get<string | number>(key(sessionId));
    if (val == null) return 0;
    const n = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.warn('[session-spend] getSessionSpend failed (fail-open):', err);
    return 0;
  }
}

export async function incrementSessionSpend(
  sessionId: string,
  usd: number,
): Promise<void> {
  if (!Number.isFinite(usd) || usd <= 0) return;
  try {
    // Upstash supports incrbyfloat with TTL — atomic.
    const fresh = await redis.incrbyfloat(key(sessionId), usd);
    if (typeof fresh === 'number' && fresh === usd) {
      // Newly created key — set the TTL.
      await redis.expire(key(sessionId), DEFAULT_TTL_SEC);
    }
  } catch (err) {
    console.warn('[session-spend] incrementSessionSpend failed (fail-open):', err);
  }
}
