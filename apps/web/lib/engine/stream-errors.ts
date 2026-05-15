/**
 * Defense-in-depth sanitizer for SSE error events.
 *
 * The t2000 engine's LLM provider (AISDKAnthropicProvider as of engine
 * 1.31.0; AnthropicProvider before that) already converts known provider
 * errors (overloaded, rate-limited, network) into clean user-facing strings
 * via `friendlyErrorMessage` before throwing. This module exists so the
 * chat/resume routes have a final
 * gatekeeper: if any other layer ever leaks a raw Anthropic JSON payload or
 * other technical message into err.message, we map it here so the chat UI
 * never renders raw JSON to the user.
 *
 * Always log the RAW message server-side for debugging (callers should do
 * this), and only emit the SANITIZED message on the wire.
 */
export function sanitizeStreamErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('overloaded_error') || lower.includes('"overloaded"')) {
    return "Anthropic's servers are over capacity right now. Please try again in 30 seconds.";
  }
  if (lower.includes('rate_limit_error')) {
    return 'Too many requests in a short window. Please wait a moment and try again.';
  }
  if (
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('socket hang up') ||
    lower.includes('fetch failed')
  ) {
    return "Couldn't reach the model provider. Check your connection and try again.";
  }
  if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
    return 'Something went wrong. Please try again.';
  }
  return raw;
}
