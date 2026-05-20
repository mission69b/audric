/**
 * Defense-in-depth sanitizer for stream error messages.
 *
 * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.3 / S.198 — 2026-05-20]
 *
 * Ported from `apps/web/lib/engine/stream-errors.ts`. The t2000
 * engine's LLM provider already converts known provider errors
 * (overloaded, rate-limited, network) into clean user-facing strings
 * via `friendlyErrorMessage` before throwing. This module exists so
 * the chat route has a final gatekeeper: if any other layer ever leaks
 * a raw Anthropic JSON payload or other technical message into
 * `err.message`, we map it here so the chat UI never renders raw JSON
 * to the user.
 *
 * Always log the RAW message server-side for debugging (callers should
 * do this — see `route.ts` `console.error(...)` calls); only emit the
 * SANITIZED message on the wire.
 */
export function sanitizeStreamErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("overloaded_error") || lower.includes('"overloaded"')) {
    return "Anthropic's servers are over capacity right now. Please try again in 30 seconds.";
  }
  if (lower.includes("rate_limit_error") || lower.includes('"status":429')) {
    return "Too many requests in a short window. Please wait a moment and try again.";
  }
  if (
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("socket hang up") ||
    lower.includes("fetch failed")
  ) {
    return "Couldn't reach the model provider. Check your connection and try again.";
  }
  // Raw JSON payload — almost always a leaked provider response body.
  if (raw.trim().startsWith("{") && raw.trim().endsWith("}")) {
    return "Something went wrong. Please try again.";
  }
  // Prisma errors carry stack traces + query metadata. Strip down.
  if (
    lower.includes("prisma") ||
    lower.includes("prismaclient") ||
    lower.includes("p2025") ||
    lower.includes("p1001")
  ) {
    return "Database error. Please try again.";
  }
  return raw;
}
