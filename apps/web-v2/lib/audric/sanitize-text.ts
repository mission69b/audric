/**
 * Client-render-side text sanitizers for the audric chat client.
 *
 * Ported from `apps/web/lib/sanitize-text.ts` (the legacy host's canonical
 * implementation, in production since SPEC 8 v0.5.2 hotfix · G1 leak,
 * 2026-05-01).
 *
 * **Why this lives in web-v2 too (2026-05-22 smoke test #4).** The
 * system prompt at `lib/audric/system-prompt.ts` L183-188 tells the LLM
 * to emit `<eval_summary>{...}</eval_summary>` INSIDE its FINAL THINKING
 * burst, NOT in assistant text. When the model obeys, AI SDK's reasoning
 * channel carries the marker and the Reasoning accordion swallows it.
 * When the model misbehaves (observed ~1/3 of confirm-tier writes on
 * Sonnet 4.6 with extended thinking enabled), the marker lands in the
 * `text` part and renders as raw JSON in the chat bubble:
 *
 *   ✦ The user has 14.18 USDC available. Let me proceed with the deposit.
 *
 *   <eval_summary>{"items": [{"label": "Wallet USDC", "status": "good", ...}]}</eval_summary>
 *
 * This util strips the marker (plus surrounding whitespace) from any
 * rendered assistant text. Also handles streaming: if `<eval_summary>`
 * has opened but not yet closed, everything from the open tag onward is
 * truncated until the closing tag arrives in a later delta.
 *
 * **Why client-render-side instead of server-side strip:**
 *   - The marker still reaches telemetry / persisted state for analysis,
 *     so we can keep tracking how often the model leaks it (DB rows
 *     retain the raw text — only the render is sanitised).
 *   - One-line render-time change vs. wire-side intercept that has to
 *     thread through every text-delta chunk.
 *   - Matches the legacy `apps/web` pattern exactly so future audits
 *     find one fix in two places.
 *
 * **Scope NOT included.** The legacy `apps/web/lib/sanitize-text.ts`
 * also exports `stripThinkingTags`, `shortenRawTxHashes`, and
 * `stripRenderedMediaMarkdown`. Per `coding-discipline.mdc` "surgical
 * changes": only port what the user reported. Add the others when
 * their leak class reproduces in web-v2.
 */

const COMPLETE_EVAL_SUMMARY_REGEX =
  /\s*<eval_summary>[\s\S]*?<\/eval_summary>\s*/g;

export function stripEvalSummaryMarker(text: string): string {
  if (!text || !text.includes("<eval_summary>")) {
    return text;
  }

  let cleaned = text.replace(COMPLETE_EVAL_SUMMARY_REGEX, "");

  // Streaming case: opening tag arrived but the closing tag hasn't.
  // Truncate from the open tag onward so partial JSON never reaches
  // the user. The next delta that contains `</eval_summary>` will
  // re-render the message; the COMPLETE regex above will strip both
  // sides cleanly.
  const trailingOpenIdx = cleaned.indexOf("<eval_summary>");
  if (trailingOpenIdx !== -1) {
    cleaned = cleaned.slice(0, trailingOpenIdx).trimEnd();
  }

  return cleaned;
}
