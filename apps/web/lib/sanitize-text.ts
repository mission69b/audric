// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.2 hotfix · G1 leak — strip `<eval_summary>` markers from
// assistant-visible text before render.
//
// The system prompt teaches the LLM to emit `<eval_summary>{...}</eval_summary>`
// inside its FINAL THINKING burst. The engine's anthropic provider parses that
// marker out of thinking text on `thinking_done` and populates the structured
// `evaluationItems` field — `<ThinkingBlockView>` then renders the parsed rows
// as the "✦ HOW I EVALUATED THIS" trust card and suppresses the raw thinking
// text entirely (see ThinkingBlockView.tsx ~80).
//
// However, when the model misbehaves and emits the same marker inside its
// FINAL TEXT response (instead of, or in addition to, the thinking burst),
// the marker reaches `<TextBlockView>` raw. Founder repro 2026-05-01:
//
//   ✦ Quote: 1 SUI → 0.913593 USDC (0.05% impact via Bluefin). Executing now.
//
//   <eval_summary>{"items": [{"label": "Wallet SUI", "status": "good", ...}]}</eval_summary>
//
// This util strips the marker (plus its surrounding whitespace) from any
// rendered assistant text. It also handles the streaming case: if a `<eval_summary>`
// has been opened but not yet closed, everything from the open tag onward is
// truncated until the closing tag arrives in a later delta.
//
// Why client-render-side instead of server-side strip:
//   - Hotfix path; engine release would take longer.
//   - The marker still reaches telemetry / persisted state for analysis,
//     so we can keep tracking how often the model leaks it.
//   - Voice TTS reads `block.text` directly (not the sanitized version)
//     — current acceptable because TTS pronounces "<eval_summary>" as
//     literal characters, which is jarring but rare. Tracked in G1.
// ───────────────────────────────────────────────────────────────────────────

const COMPLETE_MARKER_REGEX = /\s*<eval_summary>[\s\S]*?<\/eval_summary>\s*/g;

export function stripEvalSummaryMarker(text: string): string {
  if (!text || !text.includes('<eval_summary>')) return text;

  let cleaned = text.replace(COMPLETE_MARKER_REGEX, '');

  const trailingOpenIdx = cleaned.indexOf('<eval_summary>');
  if (trailingOpenIdx !== -1) {
    cleaned = cleaned.slice(0, trailingOpenIdx).trimEnd();
  }

  return cleaned;
}
