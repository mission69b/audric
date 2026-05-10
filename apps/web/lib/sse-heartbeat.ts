/**
 * SPEC 22.2 — SSE heartbeat to prevent silent stream interruptions.
 *
 * The "Response interrupted · retry" pill (see `useEngine.ts`'s
 * `flagInterrupted` cleanup paths) fires when the client's SSE
 * `reader.read()` resolves with `done=true` BEFORE the engine emits
 * `turn_complete` or `pending_action`. Server-side logs may still
 * show clean closure (`engine.chat_stream_close` outcome=
 * `turn_complete`), so the gap is in the SSE-delivery layer:
 *
 *   - Vercel's edge proxy idles connections after ~90s of zero bytes.
 *   - Some intermediaries (corporate proxies, mobile carriers) idle
 *     even sooner — 30–60s.
 *   - During long server-side waits (LLM streaming silence, slow
 *     portfolio fetches, tool execution), the SSE stream produces no
 *     bytes and these intermediaries close the underlying TCP socket.
 *
 * Fix: emit a tiny SSE comment line (`:hb\n\n`) every 5 seconds. SSE
 * comments are MUST-be-ignored by any spec-compliant parser
 * (EventSource, our custom parser in `useEngine.ts`'s
 * `processSSEChunk`). The bytes keep the connection warm without
 * polluting the event stream.
 *
 * Usage (inside a `ReadableStream`'s `start(controller)`):
 *
 * ```ts
 * const stopHeartbeat = startSseHeartbeat(controller, encoder);
 * try {
 *   // ... stream events ...
 * } finally {
 *   stopHeartbeat();
 *   controller.close();
 * }
 * ```
 *
 * Implementation notes:
 *  - 5s interval is conservative; even the most aggressive corporate
 *    proxies tolerate that. Lower = wasted bytes; higher = risk of
 *    proxy idle-timeout.
 *  - Single byte (`:hb\n\n` = 5 bytes) per tick → 60 bytes/min ambient
 *    bandwidth. Negligible.
 *  - Wrapped in try/catch because `controller.enqueue` throws if the
 *    stream is closed/cancelled. We auto-stop on first such error so
 *    we don't leak the timer.
 *  - Returns a stop function so the caller's `finally` block can
 *    clear the interval deterministically.
 */

const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_PAYLOAD = ':hb\n\n';

type EnqueueController = {
  enqueue(chunk: Uint8Array): void;
};

export function startSseHeartbeat(
  controller: EnqueueController,
  encoder: TextEncoder,
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
): () => void {
  const encoded = encoder.encode(HEARTBEAT_PAYLOAD);
  let stopped = false;
  const handle = setInterval(() => {
    if (stopped) return;
    try {
      controller.enqueue(encoded);
    } catch {
      // Stream is closed/cancelled — stop the heartbeat so we don't
      // leak the interval or spam the console. The caller's `finally`
      // will also call stop(), which is idempotent.
      stopped = true;
      clearInterval(handle);
    }
  }, intervalMs);

  return function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(handle);
  };
}
