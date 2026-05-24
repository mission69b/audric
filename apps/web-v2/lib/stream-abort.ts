/**
 * # Cross-instance stream-abort signaling — SPEC_AUDRIC_STREAM_RESUME Phase 3
 *
 * Sits next to `lib/resumable-stream.ts` (which handles the upstream byte
 * stream pub/sub) and does the orthogonal job: when the user clicks
 * Stop, signal the producer instance to call `AbortController.abort()`
 * on the in-flight `audricAgent.stream({ abortSignal })` call so the
 * LLM call genuinely cancels (and the Anthropic token spend stops).
 *
 * ## Why cross-instance is required
 *
 * In Vercel's serverless model, the POST `/api/chat` producer can be
 * running on Vercel function instance A while the user's POST
 * `/api/chat/[id]/stop` request lands on instance B. A purely local
 * `Map<streamId, AbortController>` only catches stops that happen to
 * land on the same instance — which is unreliable. The fix is Redis
 * pub/sub: stop publishes "abort" to a per-stream channel; whichever
 * instance is running the producer (and only that one) is subscribed
 * and fires the local abort.
 *
 * ## Why ONE pattern subscription, not one per stream
 *
 * Naïve design: each producer SUBSCRIBE-s `stream:abort:{id}` on start,
 * UNSUBSCRIBE-s on finish. That's two Redis ops per turn — at high
 * volume those add up (each SUBSCRIBE/UNSUBSCRIBE is a network round
 * trip on the subscriber client, and node-redis serialises sub-state
 * mutations).
 *
 * Better: every instance issues ONE `PSUBSCRIBE stream:abort:*` at
 * lazy-init time and maintains an in-memory `Map<streamId, () => void>`
 * dispatch table. Per-turn cost is just a Map.set / Map.delete — zero
 * Redis ops. The pattern subscription fires for every abort message
 * across every chat; the dispatch table routes to the right handler
 * (or no-op if this instance doesn't own the producer).
 *
 * Trade-off: every instance receives every abort message, regardless
 * of whether it owns the producer. With a single-user product at
 * audric's scale, that's a handful of messages per minute at peak —
 * trivial. Re-evaluate if scale changes 100×.
 *
 * ## Lifecycle
 *
 * - First call to `subscribeToAbort` or `publishAbort` triggers lazy
 *   `connect()` on both Redis clients.
 * - PSUBSCRIBE happens once on first `subscribeToAbort` call.
 * - Clients are module-scoped — survive across requests within a warm
 *   function instance. Cold start re-inits.
 * - No explicit teardown — Vercel kills the function process on
 *   idle, Redis connection auto-closes.
 *
 * ## Degrade-open posture
 *
 * If `REDIS_URL` is absent or init fails:
 *   - `subscribeToAbort` returns a no-op cleanup function (handler
 *     registered locally only; effective when stop lands on same
 *     instance — same as Phase 2 today).
 *   - `publishAbort` returns false (caller logs; stop still clears
 *     activeStreamId so reload doesn't auto-resume).
 *
 * Same posture as `lib/resumable-stream.ts` and `lib/ratelimit.ts`:
 * chat works without Redis, just without the cross-instance abort.
 */

import "server-only";

import { createClient } from "redis";

import { env } from "@/lib/env";

const ABORT_CHANNEL_PREFIX = "stream:abort:";
const ABORT_PATTERN = `${ABORT_CHANNEL_PREFIX}*`;
const ABORT_MESSAGE = "abort";

type Handler = () => void;

// Type alias for the redis client. Using `ReturnType` instead of the
// `RedisClientType` export because the latter has a different generic
// shape (no module-args) than what `createClient({ url })` returns
// in the installed `redis@5.x` — assigning the inferred client to a
// `RedisClientType | null` is a type error per TS 5.x's stricter
// generic variance rules. `ReturnType<typeof createClient>` always
// matches by construction.
type Client = ReturnType<typeof createClient>;

const localHandlers = new Map<string, Handler>();

let initPromise: Promise<{ pub: Client; sub: Client } | null> | null = null;
// Memoise the pSubscribe call itself, not just a flag. Concurrent
// callers (two chat turns starting on the same warm instance within
// the same tick) MUST see the same in-flight subscribe Promise,
// otherwise both would call `clients.sub.pSubscribe(pattern, listener)`
// and node-redis would either reject the second OR register a
// duplicate listener — either way wrong. The Promise reference
// resolves once, and subsequent calls await the same fulfilled value.
let subscribePromise: Promise<boolean> | null = null;

function getClients() {
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    if (!env.REDIS_URL) {
      return null;
    }
    try {
      const pub = createClient({ url: env.REDIS_URL });
      const sub = createClient({ url: env.REDIS_URL });
      pub.on("error", (err) => {
        console.error("[stream-abort] publisher error:", err);
      });
      sub.on("error", (err) => {
        console.error("[stream-abort] subscriber error:", err);
      });
      await Promise.all([pub.connect(), sub.connect()]);
      return { pub, sub };
    } catch (err) {
      console.error("[stream-abort] init failed:", err);
      return null;
    }
  })();
  return initPromise;
}

function ensurePatternSubscribed(): Promise<boolean> {
  if (subscribePromise) {
    return subscribePromise;
  }
  subscribePromise = (async () => {
    const clients = await getClients();
    if (!clients) {
      return false;
    }
    try {
      await clients.sub.pSubscribe(ABORT_PATTERN, (message, channel) => {
        if (message !== ABORT_MESSAGE) {
          return;
        }
        const streamId = channel.slice(ABORT_CHANNEL_PREFIX.length);
        // One-shot dispatch: delete before firing. Prevents same-instance
        // double-fire when publishAbort already fired locally and then
        // published to Redis (whose fanout loops back to this instance's
        // pSubscribe). AbortController.abort() is idempotent so functional
        // correctness held without the delete, but log noise + duplicate
        // handler invocations are avoided here.
        const handler = localHandlers.get(streamId);
        if (handler) {
          localHandlers.delete(streamId);
          try {
            handler();
          } catch (err) {
            console.error(
              `[stream-abort] handler threw for streamId=${streamId}:`,
              err
            );
          }
        }
      });
      return true;
    } catch (err) {
      console.error("[stream-abort] pSubscribe failed:", err);
      // Reset the promise so a later request can retry (e.g. transient
      // Redis hiccup that resolves before the next stream starts).
      subscribePromise = null;
      return false;
    }
  })();
  return subscribePromise;
}

/**
 * Register an abort handler for a stream id. Returns a cleanup function
 * the caller MUST invoke when the stream completes (in `onFinish` or a
 * finally block) — otherwise the handler stays in the dispatch table
 * forever and a late abort message could fire on a freed
 * `AbortController` (no-op but noisy).
 *
 * Awaits `ensurePatternSubscribed()` so a cross-instance abort
 * publish that lands milliseconds after this returns is guaranteed
 * to be delivered (pSubscribe is fully established). Adds ~5-20ms on
 * cold-instance first-call; thereafter the pSubscribe is cached and
 * the function returns synchronously after the Map.set.
 *
 * Degrades open: if Redis init fails the handler still registers
 * locally, so an abort that lands on this same instance still fires.
 * Only cross-instance abort is sacrificed in the degraded case.
 */
export async function subscribeToAbort(
  streamId: string,
  onAbort: Handler
): Promise<() => void> {
  localHandlers.set(streamId, onAbort);
  await ensurePatternSubscribed();
  return () => {
    localHandlers.delete(streamId);
  };
}

/**
 * Publish an abort signal to all instances. Returns the number of
 * subscribers that received the message (0 if no producer is currently
 * subscribed — e.g. the producer already finished naturally, or the
 * stream id is unknown).
 *
 * Also fires the local handler IF the producer is on this same
 * instance. This is the fast path — abort lands in the same function
 * invocation as the producer, no Redis round trip needed.
 */
export async function publishAbort(streamId: string): Promise<number> {
  // Local short-circuit: if the producer is on this same instance,
  // fire the local handler immediately. Same-instance abort latency
  // drops from ~Redis-RTT to zero. Delete BEFORE firing so the Redis
  // fanout (which loops back to this instance's pSubscribe) doesn't
  // re-fire the handler. One-shot dispatch semantics.
  //
  // The publish below STILL fires for cross-instance correctness —
  // there's no harm in publishing even when we already fired locally
  // (the pSubscribe handler finds nothing in the map → no-op).
  const local = localHandlers.get(streamId);
  if (local) {
    localHandlers.delete(streamId);
    try {
      local();
    } catch (err) {
      console.error(
        `[stream-abort] local handler threw for streamId=${streamId}:`,
        err
      );
    }
  }

  const clients = await getClients();
  if (!clients) {
    // No Redis → no cross-instance fanout. Local fire above is the
    // best we can do (same as Phase 2 behavior).
    return local ? 1 : 0;
  }
  try {
    const channel = `${ABORT_CHANNEL_PREFIX}${streamId}`;
    const receivers = await clients.pub.publish(channel, ABORT_MESSAGE);
    return receivers;
  } catch (err) {
    console.error(
      `[stream-abort] publish failed for streamId=${streamId}:`,
      err
    );
    return local ? 1 : 0;
  }
}

/**
 * Test-only: clear the local handler map + reset init state. Used by
 * vitest tests to start each test with a clean module state. NOT
 * exported via barrel — direct import path only.
 */
export function __resetForTests() {
  localHandlers.clear();
  initPromise = null;
  subscribePromise = null;
}
