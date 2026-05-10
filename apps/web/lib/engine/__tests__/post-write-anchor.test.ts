import { describe, expect, it } from 'vitest';
import type { Message } from '@t2000/engine';
import {
  buildPostWriteAnchorBlock,
  walkForAnchorState,
} from '../post-write-anchor';

/**
 * Regression tests for SPEC 21.2.b — post-write balance anchor.
 *
 * Production smoke 2026-05-09 (session s_1778362657811_c0ed9009a5fb):
 * after a successful bundle (swap+save), the LLM's NEXT user prompt
 * ("swap 0.50 USDC to SUI") was processed without re-checking
 * balance — the LLM's `<eval_summary>` cited the pre-bundle 10.31 USDC
 * figure even though PWR had injected a fresh balance_check showing
 * $0 USDC at history index [22]. The swap_execute then failed
 * on-chain.
 *
 * These tests pin the walker's emit/suppress decisions for every
 * scenario that should/shouldn't trigger the anchor block.
 */

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function userText(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }] };
}

function assistantToolUse(id: string, name: string, input: unknown = {}): Message {
  return {
    role: 'assistant',
    content: [{ type: 'tool_use', id, name, input }],
  };
}

function userToolResult(toolUseId: string, content: string, isError = false): Message {
  return {
    role: 'user',
    content: [{ type: 'tool_result', toolUseId, content, isError }],
  };
}

function bootstrapHistory(): Message[] {
  // Mirrors audric's session bootstrap: pre-fetch balance_check + savings_info
  // before any user message is processed. Every authed session starts here.
  return [
    userText('[session bootstrap]'),
    assistantToolUse('etch_bal', 'balance_check'),
    assistantToolUse('etch_sav', 'savings_info'),
    userToolResult('etch_bal', '{"total":10.81,"wallet":10.81,"savings":0}'),
    userToolResult('etch_sav', '{"total":0}'),
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Session data loaded.' }],
    },
  ];
}

// ---------------------------------------------------------------------------
// walkForAnchorState
// ---------------------------------------------------------------------------

describe('walkForAnchorState', () => {
  it('returns -1 indices when history is empty', () => {
    expect(walkForAnchorState([])).toEqual({
      lastWriteIndex: -1,
      lastFreshBalanceIndex: -1,
      freshBalanceTurnLabel: -1,
      lastBundleRevertedIndex: -1,
    });
  });

  it('finds session-bootstrap balance_check + no writes', () => {
    // bootstrap layout:
    //   [0] user "[session bootstrap]"
    //   [1] assistant tool_use balance_check (etch_bal)
    //   [2] assistant tool_use savings_info  (etch_sav)
    //   [3] user      tool_result etch_bal
    //   [4] user      tool_result etch_sav   ← latest fresh balance read
    //   [5] assistant text "Session data loaded."
    const history = bootstrapHistory();
    const result = walkForAnchorState(history);
    expect(result.lastWriteIndex).toBe(-1);
    expect(result.lastFreshBalanceIndex).toBe(4);
  });

  it('finds the most recent write tool_use across multiple', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('save 5'),
      assistantToolUse('w1', 'save_deposit', { amount: 5 }),
      userToolResult('w1', '{"tx":"0xa"}'),
      userText('send 1'),
      assistantToolUse('w2', 'send_transfer', { amount: 1 }),
      userToolResult('w2', '{"tx":"0xb"}'),
    ];
    const result = walkForAnchorState(history);
    // Most recent write tool_use is w2 (send_transfer). Its message
    // index is 6 + bootstrap (6 items) - 1 = 11; let's compute from the array.
    const expected = history.findIndex((_m, i) => {
      return history[i].role === 'assistant'
        && history[i].content.some(b => b.type === 'tool_use' && b.name === 'send_transfer');
    });
    expect(result.lastWriteIndex).toBe(expected);
  });

  it('treats <canonical_route> text in user message as a write indicator', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('swap 0.5 USDC to SUI'),
      assistantToolUse('q1', 'swap_quote'),
      userToolResult('q1', '{"out":0.46}'),
      assistantToolUse('w1', 'swap_execute'),
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'w1', content: '{"tx":"0xa"}' },
          { type: 'text', text: '<canonical_route>...</canonical_route>' },
        ],
      },
    ];
    const result = walkForAnchorState(history);
    // The canonical_route message is at index history.length - 1.
    expect(result.lastWriteIndex).toBe(history.length - 1);
  });

  it('counts PWR balance_check (post-write refresh) as a fresh balance read', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('swap 0.5 USDC to SUI'),
      assistantToolUse('w1', 'swap_execute'),
      userToolResult('w1', '{"tx":"0xa"}'),
      // PWR fires:
      assistantToolUse('ce_check', 'balance_check'),
      userToolResult('ce_check', '{"total":10.31,"wallet":10.31}'),
    ];
    const result = walkForAnchorState(history);
    const expected = history.length - 1; // PWR balance_check tool_result
    expect(result.lastFreshBalanceIndex).toBe(expected);
    expect(result.freshBalanceTurnLabel).toBe(expected);
  });

  it('skips error tool_results when finding fresh balance', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      assistantToolUse('b2', 'balance_check'),
      userToolResult('b2', '{"error":"timeout"}', true), // isError: true
    ];
    const result = walkForAnchorState(history);
    // Should fall back to the bootstrap's etch_sav result (index 4),
    // not the errored b2 result. (etch_sav is the latest non-error
    // fresh-balance tool_result in bootstrap; balance_check at index 3
    // is shadowed by the savings_info at index 4.)
    expect(result.lastFreshBalanceIndex).toBe(4);
  });

  it('counts savings_info results, not just balance_check', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      assistantToolUse('s2', 'savings_info'),
      userToolResult('s2', '{"total":42}'),
    ];
    const result = walkForAnchorState(history);
    expect(result.lastFreshBalanceIndex).toBe(history.length - 1);
  });

  it('does NOT count read-only-but-non-balance tool results as fresh balance', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      assistantToolUse('r1', 'rates_info'),
      userToolResult('r1', '{"USDC":4.94}'),
    ];
    const result = walkForAnchorState(history);
    // Latest balance read is still the bootstrap savings_info at index 4.
    expect(result.lastFreshBalanceIndex).toBe(4);
  });

  it('does NOT count prepare_bundle as a write (it is a planning tool)', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('swap then save'),
      assistantToolUse('p1', 'prepare_bundle'),
      userToolResult('p1', '{"ok":true,"bundleId":"x"}'),
    ];
    const result = walkForAnchorState(history);
    expect(result.lastWriteIndex).toBe(-1); // no write detected — prepare_bundle alone doesn't count
  });
});

// ---------------------------------------------------------------------------
// buildPostWriteAnchorBlock
// ---------------------------------------------------------------------------

describe('buildPostWriteAnchorBlock', () => {
  it('returns null when history has no writes', () => {
    expect(buildPostWriteAnchorBlock(bootstrapHistory())).toBeNull();
  });

  it('returns null when only a prepare_bundle (no write) has fired', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      assistantToolUse('p1', 'prepare_bundle'),
      userToolResult('p1', '{"ok":true,"bundleId":"x"}'),
    ];
    expect(buildPostWriteAnchorBlock(history)).toBeNull();
  });

  it('emits the standard anchor block after a single-write swap_execute', () => {
    // Reproduces the production smoke shape: single-write succeeds,
    // PWR fires, user types a NEW prompt → anchor should fire.
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('swap 0.5 USDC to SUI'),
      assistantToolUse('q1', 'swap_quote'),
      userToolResult('q1', '{"out":0.46}'),
      assistantToolUse('w1', 'swap_execute'),
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'w1', content: '{"tx":"0xa"}' },
          { type: 'text', text: '<canonical_route>...</canonical_route>' },
        ],
      },
      assistantToolUse('ce_check', 'balance_check'),
      userToolResult('ce_check', '{"total":10.31,"wallet":10.31}'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Swapped 0.5 USDC for 0.46 SUI.' }],
      },
    ];
    const block = buildPostWriteAnchorBlock(history);
    expect(block).not.toBeNull();
    expect(block).toContain('<post_write_anchor>');
    expect(block).toContain('</post_write_anchor>');
    expect(block).toContain('freshest balance_check');
    // Should point at the PWR balance_check at index history.length - 2
    // (after the canonical_route message + balance_check result + assistant text).
    const pwrIndex = history.findIndex(
      (_m, i) =>
        history[i].role === 'user' &&
        history[i].content.some(
          (b) => b.type === 'tool_result' && b.toolUseId === 'ce_check',
        ),
    );
    expect(block).toContain(`turn ${pwrIndex}`);
  });

  it('emits the standard anchor block after a bundle (canonical_route present, no write tool_use)', () => {
    // Bundle execution leaves NO write tool_use in LLM-visible history
    // (the bundle is dispatched via the chat-route fast-path and only
    // shows up as plain text + canonical_route). The anchor must still
    // fire — driven by canonical_route alone.
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('swap then save'),
      assistantToolUse('q1', 'swap_quote'),
      userToolResult('q1', '{"out":0.46}'),
      assistantToolUse('p1', 'prepare_bundle'),
      userToolResult('p1', '{"ok":true,"bundleId":"x"}'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Ready to confirm: 1) swap 2) save' }],
      },
      userText('Confirm'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Confirmed. Compiled into one atomic Payment Intent.' }],
      },
      userText('<canonical_route>...</canonical_route>'),
      assistantToolUse('ce_check', 'balance_check'),
      assistantToolUse('ngs_info', 'savings_info'),
      userToolResult('ce_check', '{"total":0,"wallet":0}'),
      userToolResult('ngs_info', '{"total":34.84}'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Bundle executed. Swapped 0.5, saved 9.81.' }],
      },
    ];
    const block = buildPostWriteAnchorBlock(history);
    expect(block).not.toBeNull();
    expect(block).toContain('<post_write_anchor>');
    expect(block).toContain('freshest balance_check');
  });

  it('emits the defensive variant when a write is detected but no fresh balance result exists', () => {
    // Edge case: write happened but PWR somehow didn't fire OR every
    // balance_check result was an error. Anchor reframes the directive
    // to "call balance_check FIRST" since there's nothing concrete to
    // point at.
    const history: Message[] = [
      userText('hi'),
      assistantToolUse('w1', 'swap_execute'),
      userToolResult('w1', '{"tx":"0xa"}'),
    ];
    const block = buildPostWriteAnchorBlock(history);
    expect(block).not.toBeNull();
    expect(block).toContain('<post_write_anchor>');
    expect(block).toContain('There is no balance_check result');
    expect(block).toContain('MUST call balance_check FIRST');
  });

  it('forbids citing balance figures from prior eval_summary / thinking / text', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('save 1'),
      assistantToolUse('w1', 'save_deposit'),
      userToolResult('w1', '{"tx":"0xa"}'),
      assistantToolUse('ce_check', 'balance_check'),
      userToolResult('ce_check', '{"total":9.81,"wallet":9.81}'),
    ];
    const block = buildPostWriteAnchorBlock(history);
    expect(block).not.toBeNull();
    expect(block).toContain('eval_summary');
    expect(block).toContain('thinking');
  });

  // -------------------------------------------------------------------------
  // Bug B fix / 2026-05-10 — bundle-reverted detection + <bundle_reverted>
  // anchor variant. Production smoke S.142 (Bug A) had a 3-step bundle fail
  // at Enoki sponsorship → every stepResult.result carried `_bundleReverted:
  // true` → engine pushed N tool_results with that JSON content → LLM
  // narrated "Bundle executed. Swapped 5 USDC → SUI..." anyway, ignoring
  // both the isError flags AND the post-write balance_check showing
  // unchanged balances.
  //
  // The inline-error-string fix (`buildBundleRevertedError` in
  // executeToolAction.ts) handles the resume-turn narration. THIS anchor
  // variant handles the FOLLOW-UP turn — when the user asks "did that
  // work?" / "what happened?", the standard `<post_write_anchor>` would
  // tell the LLM "a write executed earlier" (wrong, it reverted). The
  // `<bundle_reverted>` directive corrects that.
  // -------------------------------------------------------------------------

  it('walker: detects _bundleReverted marker in tool_result content', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('swap then save'),
      assistantToolUse('q1', 'swap_quote'),
      userToolResult('q1', '{"out":0.46}'),
      // Bundle confirmed → executed → reverted. Content carries
      // `_bundleReverted: true` plus the strong narration directive
      // (mimics buildBundleRevertedError output, but we only need the
      // marker substring for the walker).
      userText('Confirm'),
      userToolResult(
        'b1-step1',
        '{"success":false,"error":"BUNDLE REVERTED — NOTHING EXECUTED. Cause: Cannot use GasCoin","_bundleReverted":true}',
        true,
      ),
      userToolResult(
        'b1-step2',
        '{"success":false,"error":"BUNDLE REVERTED — NOTHING EXECUTED. Cause: Cannot use GasCoin","_bundleReverted":true}',
        true,
      ),
    ];
    const result = walkForAnchorState(history);
    expect(result.lastBundleRevertedIndex).toBe(history.length - 1);
  });

  it('walker: lastBundleRevertedIndex stays -1 on a successful bundle', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('swap'),
      assistantToolUse('w1', 'swap_execute'),
      userToolResult('w1', '{"success":true,"tx":"0xa","amount":0.5}'),
    ];
    const result = walkForAnchorState(history);
    expect(result.lastBundleRevertedIndex).toBe(-1);
  });

  it('builder: emits <bundle_reverted> when most recent write was a reverted bundle', () => {
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('swap 5 USDC to SUI then swap 3 USDC to GOLD then save 2 USDC'),
      assistantToolUse('q1', 'swap_quote'),
      userToolResult('q1', '{"out":4.4}'),
      assistantToolUse('q2', 'swap_quote'),
      userToolResult('q2', '{"out":0.0006}'),
      userText('Confirm'),
      // 3-step bundle reverted at Enoki — every step gets the marker.
      userToolResult(
        'step1',
        '{"success":false,"error":"BUNDLE REVERTED — NOTHING EXECUTED ON-CHAIN. Cause: Cannot use GasCoin","_bundleReverted":true}',
        true,
      ),
      userToolResult(
        'step2',
        '{"success":false,"error":"BUNDLE REVERTED — NOTHING EXECUTED ON-CHAIN. Cause: Cannot use GasCoin","_bundleReverted":true}',
        true,
      ),
      userToolResult(
        'step3',
        '{"success":false,"error":"BUNDLE REVERTED — NOTHING EXECUTED ON-CHAIN. Cause: Cannot use GasCoin","_bundleReverted":true}',
        true,
      ),
      // Auto-injected post-write balance_check confirms unchanged state.
      assistantToolUse('ce_check', 'balance_check'),
      userToolResult('ce_check', '{"total":17.07,"wallet":17.07}'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'The bundle reverted; nothing executed.' }],
      },
    ];
    const block = buildPostWriteAnchorBlock(history);
    expect(block).not.toBeNull();
    expect(block).toContain('<bundle_reverted>');
    expect(block).toContain('</bundle_reverted>');
    // Must NOT emit the standard post_write_anchor (which would lie
    // about a write executing).
    expect(block).not.toContain('<post_write_anchor>');
    // Must include the truthful narration directive.
    expect(block).toContain('reverted on-chain');
    expect(block).toContain('Nothing executed');
    expect(block).toContain('Do NOT claim any leg succeeded');
    // Must point at the freshest balance_check.
    expect(block).toContain('freshest balance_check');
  });

  it('builder: a successful write AFTER a revert resets the anchor back to <post_write_anchor>', () => {
    // User's bundle reverted, then they ran a single-write swap that
    // succeeded. The freshest write-related signal is the SUCCESS, so
    // the standard anchor fires (not the revert variant).
    const history: Message[] = [
      ...bootstrapHistory(),
      userText('swap then save'),
      userText('Confirm'),
      userToolResult(
        'rev1',
        '{"success":false,"error":"BUNDLE REVERTED","_bundleReverted":true}',
        true,
      ),
      assistantToolUse('ce_check_1', 'balance_check'),
      userToolResult('ce_check_1', '{"total":17.07,"wallet":17.07}'),
      // User retries with a smaller single swap that succeeds.
      userText('swap 1 USDC to SUI'),
      assistantToolUse('w1', 'swap_execute'),
      userToolResult('w1', '{"success":true,"tx":"0xa"}'),
      assistantToolUse('ce_check_2', 'balance_check'),
      userToolResult('ce_check_2', '{"total":16.07,"wallet":16.07}'),
    ];
    const block = buildPostWriteAnchorBlock(history);
    expect(block).not.toBeNull();
    expect(block).toContain('<post_write_anchor>');
    expect(block).not.toContain('<bundle_reverted>');
  });

  it('builder: <bundle_reverted> still emits when balance_check is missing (defensive variant)', () => {
    const history: Message[] = [
      userText('swap then save'),
      userText('Confirm'),
      userToolResult(
        'rev1',
        '{"success":false,"error":"BUNDLE REVERTED","_bundleReverted":true}',
        true,
      ),
    ];
    const block = buildPostWriteAnchorBlock(history);
    expect(block).not.toBeNull();
    expect(block).toContain('<bundle_reverted>');
    // Defensive copy (no concrete balance result to point at).
    expect(block).toContain('no balance_check result');
    expect(block).toContain('call balance_check FIRST');
  });
});
