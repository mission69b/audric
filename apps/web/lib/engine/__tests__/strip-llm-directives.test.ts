import { describe, expect, it } from 'vitest';
import {
  SESSION_BOOTSTRAP_SENTINEL,
  stripLlmDirectives,
} from '../strip-llm-directives';

describe('stripLlmDirectives', () => {
  it('returns text unchanged when no directives are present', () => {
    expect(stripLlmDirectives('swap 1 usdc for sui')).toBe('swap 1 usdc for sui');
  });

  it('strips a single <post_write_anchor> block followed by user text', () => {
    const input =
      '<post_write_anchor>\n' +
      "A write executed earlier in this session. The freshest balance_check / savings_info result in your conversation history is at turn 40 (most recent in your context). For ANY new write you propose this turn, derive the wallet balance from THAT result, not from prior `<eval_summary>`, prior text, prior `thinking`, or your own running tally. If the freshest balance result is more than 2 turns old AND the user is asking for a new write, call balance_check FIRST in this turn before composing the eval_summary or proposing the write.\n" +
      '</post_write_anchor> swap 1 usdc to gold';
    expect(stripLlmDirectives(input)).toBe('swap 1 usdc to gold');
  });

  it('strips a single <canonical_route> block', () => {
    const input =
      '<canonical_route>\nThe user just approved a swap. The CANONICAL route taken on-chain is:\n- Pair: USDC → SUI\n- Path: BLUEFIN\n- Price impact: 0.052%\nWhen narrating this swap, cite this EXACT path string. Do NOT reference any prior swap_quote that produced a different route — that quote is no longer canonical.\n</canonical_route>';
    expect(stripLlmDirectives(input)).toBe('');
  });

  it('strips a <bundle_reverted> block', () => {
    const input =
      '<bundle_reverted>\nThe user\'s most recent confirmed bundle reverted on-chain (atomic Sui Payment Intent semantics). Nothing executed.\n</bundle_reverted>\n\nwhat happened?';
    expect(stripLlmDirectives(input)).toBe('what happened?');
  });

  it('strips multiple distinct directives in one message (the bundle case)', () => {
    const input =
      '<canonical_route>\n- Pair: USDC → SUI\n- Path: BLUEFIN + CETUS\n</canonical_route>\n' +
      '<canonical_route>\n- Pair: USDC → GOLD\n- Path: BLUEFIN\n</canonical_route>';
    expect(stripLlmDirectives(input)).toBe('');
  });

  it('strips both an anchor AND a canonical_route preceding user text', () => {
    const input =
      '<post_write_anchor>anchor body</post_write_anchor>\n' +
      '<canonical_route>route body</canonical_route>\n\n' +
      'show me my balance';
    expect(stripLlmDirectives(input)).toBe('show me my balance');
  });

  it('leaves an unclosed directive tag intact (regex requires matching close)', () => {
    // Defensive: if the engine ever emits a malformed block, we'd
    // rather show the raw text than silently swallow user input the
    // regex over-greedily ate. The regex is non-greedy + requires a
    // matching close tag, so this passes through untouched.
    const input = '<post_write_anchor>oops never closed swap 1 usdc';
    expect(stripLlmDirectives(input)).toBe('<post_write_anchor>oops never closed swap 1 usdc');
  });

  it('returns empty string when input is whitespace-only after stripping', () => {
    const input = '<post_write_anchor>x</post_write_anchor>\n   \n  ';
    expect(stripLlmDirectives(input)).toBe('');
  });

  it('does NOT strip <eval_summary> (intentionally — assistant-side, not user-text)', () => {
    // <eval_summary> lives in assistant thinking blocks, not user
    // message text. The strip helper is user-message-only — no need
    // to handle it.
    const input = '<eval_summary>foo</eval_summary> swap 1 usdc';
    expect(stripLlmDirectives(input)).toBe('<eval_summary>foo</eval_summary> swap 1 usdc');
  });

  it('does NOT strip <financial_context> (intentionally — system-prompt only)', () => {
    // <financial_context> lives in the SYSTEM PROMPT, not in user
    // messages. The system prompt isn't persisted as a ledger row,
    // so it can't leak on rehydrate — no strip needed.
    const input = '<financial_context>foo</financial_context> hello';
    expect(stripLlmDirectives(input)).toBe('<financial_context>foo</financial_context> hello');
  });

  it('exposes the SESSION_BOOTSTRAP_SENTINEL constant for caller-side message-drop logic', () => {
    expect(SESSION_BOOTSTRAP_SENTINEL).toBe('[session bootstrap]');
  });
});
