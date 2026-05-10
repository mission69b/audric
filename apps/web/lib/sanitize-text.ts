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

// ───────────────────────────────────────────────────────────────────────────
// SPEC 7 P2.8 follow-up · Bug C — strip `<thinking>` tags from visible text.
//
// Sonnet with extended thinking enabled occasionally mimics the `<thinking>`
// XML pattern in its FINAL TEXT response (instead of using the dedicated
// thinking channel). Founder repro 2026-05-03:
//
//   ✦ <thinking>
//
//   The guard is checking that swap_quote was called IMMEDIATELY before...
//
//   </thinking>
//
// The model's actual reasoning is already routed through the extended
// thinking channel (parsed by the engine, rendered as a separate THOUGHT
// block via ThinkingBlockView). The leaked `<thinking>` block in text
// content is a duplicate that confuses users and breaks the chat layout.
//
// This util strips the marker (plus surrounding whitespace) from any
// rendered assistant text. Mirrors stripEvalSummaryMarker — same streaming
// truncation behavior for partial markers.
// ───────────────────────────────────────────────────────────────────────────

const COMPLETE_THINKING_REGEX = /\s*<thinking>[\s\S]*?<\/thinking>\s*/g;

export function stripThinkingTags(text: string): string {
  if (!text || !text.includes('<thinking>')) return text;

  let cleaned = text.replace(COMPLETE_THINKING_REGEX, '');

  const trailingOpenIdx = cleaned.indexOf('<thinking>');
  if (trailingOpenIdx !== -1) {
    cleaned = cleaned.slice(0, trailingOpenIdx).trimEnd();
  }

  return cleaned;
}

// ───────────────────────────────────────────────────────────────────────────
// SPEC 21.2 D-4a · 2026-05-10 — UI defense-in-depth for raw tx hashes
//
// The system prompt (engine-context.ts) already tells the LLM:
//   "Never emit a raw transaction hash in prose. The receipt card shows the
//    hash and the explorer link. If you must reference the tx, link it as
//    [view tx](https://suivision.xyz/txblock/<hash>)."
//
// This UI helper is a defense-in-depth fallback for the case where the LLM
// ignores the rule and emits a bare base58 digest in narration. We shorten
// it to a 6-char-prefix … 4-char-suffix form so:
//   1. The user still sees a recognisable tx fingerprint (matches the
//      explorer card the receipt block already renders).
//   2. The wall-of-base58 visual noise is gone (avg compaction: 50 chars
//      → 11 chars).
//   3. Markdown links and URL fragments are preserved unchanged (so a
//      `[abc…123](https://suivision.xyz/txblock/<hash>)` link keeps both
//      the human-readable label and the working href).
//
// Pattern: 40–60 char base58 strings (Sui tx digests are 43–44 chars; the
// looser bound catches truncated quotes from logs etc) NOT adjacent to
// word chars, slashes, or markdown brackets. The negative lookarounds
// preserve:
//   - `https://...txblock/<hash>`  (preceded by `/`)
//   - `[<hash>](url)` markdown labels (preceded by `[`, followed by `]`)
//   - identifier-like tokens (preceded/followed by word chars)
//
// ⚠️ Limitation: a hash glued to ASCII punctuation like a parenthesis
// (`(5cFhP…)`) IS shortened, which we judge correct — the parens are
// prose decoration, not a markdown / URL container.
// ───────────────────────────────────────────────────────────────────────────

const RAW_TX_HASH_REGEX = /(?<![\w/\[])([A-HJ-NP-Za-km-z1-9]{40,60})(?![\w/\]])/g;

export function shortenRawTxHashes(text: string): string {
  if (!text) return text;
  return text.replace(RAW_TX_HASH_REGEX, (match) => {
    if (match.length <= 12) return match;
    return `${match.slice(0, 6)}…${match.slice(-4)}`;
  });
}
