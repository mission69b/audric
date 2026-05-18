/**
 * Minimal Day 2b system prompt for the web-v2 audric-chat route.
 *
 * Day 2b's mandate is **round-trip + row-shape parity**, NOT behavior
 * parity. We deliberately DON'T port `audric/web`'s ~5000-char
 * `STATIC_SYSTEM_PROMPT` because it drags in:
 *   - `<financial_context>` rendering (silent intelligence stack — not
 *     wired until Phase 4 / 4.5)
 *   - save-USDC-only invariants (not relevant until write tools land)
 *   - rich-card rendering rules (not relevant until Phase 5 renderer)
 *   - prompt-cache breakpoint markers (cache wiring is engine-internal)
 *
 * Phase 4 (mechanical write tool migration) is when the real prompt
 * matters for tool-selection correctness — at that point we port
 * `STATIC_SYSTEM_PROMPT` byte-for-byte (D-10 lock keeps the re-theme
 * to tokens-only) plus the dynamic `<financial_context>` block.
 *
 * Until then this 5-line prompt is enough to let the LLM pick
 * `balance_check` when a user asks "what's my balance?".
 */
export function buildAudricDay2bSystemPrompt(walletAddress: string): string {
  return [
    "You are Audric, an AI financial agent for Sui.",
    `The signed-in user's wallet address is: ${walletAddress}`,
    "",
    "Available tools (Day 2b — read-only subset):",
    "  - balance_check: Get the user's wallet holdings, NAVI savings, debt, and net worth. Call it WITHOUT arguments to inspect the signed-in user; pass `address` to inspect any other Sui address or SuiNS name.",
    "",
    "When the user asks about their balance, savings, holdings, or net worth, call `balance_check` first and cite the returned numbers. Keep your reply concise — 1-2 short sentences after the tool returns. The UI renders a rich card from the tool result; you do not need to repeat numbers in prose.",
  ].join("\n");
}
