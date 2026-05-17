// ---------------------------------------------------------------------------
// lib/engine/live-stream-clobber-detection.ts — S.152 polish (2026-05-18)
// ---------------------------------------------------------------------------
//
// `useEngine` persists the engine-emitted `streamId` into per-session
// `sessionStorage` under `audric:liveStream:<sessionId>` (see `useEngine.ts`
// `writeLiveStreamId`). The cold page-reload auto-resume reads back from
// the same key on mount.
//
// **Why this helper exists.** In a single tab, sessionStorage is naturally
// per-tab so the same audric `sessionId` in two browser tabs each has its
// own independent `audric:liveStream:<sid>` entry. Nothing collides.
//
// But several edge cases can produce a same-sessionStorage clobber:
//
//   1. **Tab duplication.** Cmd+D / right-click "Duplicate Tab" copies the
//      source tab's sessionStorage as a snapshot. Both tabs initially see
//      the same persisted streamId. After duplication, writes diverge —
//      but until one of them clears, both tabs may write a fresh streamId
//      to their own copies.
//
//   2. **Rapid second turn before the first completes.** A user fires turn
//      A → engine emits `stream_started{streamA}` and we persist `streamA`.
//      The user types and fires turn B before turn A clears. The engine
//      emits `stream_started{streamB}` on the second POST, and we'd silently
//      overwrite `streamA` even though turn A's checkpoint is still live
//      in Upstash — orphaning it from cold-reload resume.
//
//   3. **Two simultaneous SSE consumers in dev tools / Playwright probes.**
//      Each consumer's first event is `stream_started` with a fresh streamId;
//      whichever writes last wins.
//
// All three are LOW PROBABILITY in real user flows. This helper exists to
// produce a structured `console.warn` telemetry signal when the clobber
// actually fires in production — enough to either confirm it stays rare
// (and stays as a known acceptable edge case) or to motivate a real fix
// (per-tab namespacing via a tab-id) if the volume justifies it.
//
// **Behavior:** pure function. No I/O, no side effects. The caller (the
// hook in `useEngine.ts`) decides whether to actually call `console.warn`
// based on the returned `shouldWarn` flag. Idempotent same-value writes
// (re-writing the same streamId) do NOT warn — only genuinely different
// values trigger the signal.
// ---------------------------------------------------------------------------

export interface ClobberDetectionResult {
  /**
   * `true` when the caller is about to overwrite a previously-persisted
   * streamId with a DIFFERENT non-empty value. Caller should `console.warn`
   * with the structured message in `reason`.
   */
  shouldWarn: boolean;
  /**
   * Structured warning message ready for `console.warn`. Includes session
   * + previous + new streamId so Vercel-log search can pivot on any of them.
   *
   * Format: `[useEngine] LIVE_STREAM_ID_CLOBBER session=<sid> previous=<old> new=<new>`
   *
   * Undefined when `shouldWarn` is `false`.
   */
  reason?: string;
}

/**
 * Pure helper — decides whether a `writeLiveStreamId` call would
 * overwrite a non-matching pre-existing streamId.
 *
 * @param previousStreamId - the value currently in sessionStorage (or the
 *   in-memory fallback Map), or `null` if the slot is empty.
 * @param newStreamId - the streamId about to be written.
 * @param sessionId - the audric session id (used only to compose the
 *   warning message — not used for clobber detection itself).
 */
export function detectLiveStreamIdClobber(
  previousStreamId: string | null,
  newStreamId: string,
  sessionId: string,
): ClobberDetectionResult {
  // Empty slot — no clobber.
  if (!previousStreamId) {
    return { shouldWarn: false };
  }
  // Idempotent re-write of the same id — no clobber. Can happen if the
  // hook re-runs writeLiveStreamId on a fresh re-mount where the existing
  // sessionStorage entry IS the current stream's id.
  if (previousStreamId === newStreamId) {
    return { shouldWarn: false };
  }
  // Different non-empty prior value — caller is about to clobber.
  return {
    shouldWarn: true,
    reason: `[useEngine] LIVE_STREAM_ID_CLOBBER session=${sessionId} previous=${previousStreamId} new=${newStreamId}`,
  };
}
