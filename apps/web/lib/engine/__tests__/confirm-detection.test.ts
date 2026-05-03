import { describe, it, expect } from 'vitest';
import type { Message } from '@t2000/engine';
import { detectBundleConfirm, __testOnly__ } from '../confirm-detection';

const { CONFIRM_PATTERN, countDistinctWriteVerbs } = __testOnly__;

function asstText(text: string): Message {
  return { role: 'assistant', content: [{ type: 'text', text }] };
}

function userText(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }] };
}

const PLAN_3OP = [
  'Plan:',
  '1. Withdraw 5 USDC from savings',
  '2. Swap 5 USDC to ~5 USDsui',
  '3. Save 5 USDsui into NAVI',
  '',
  'Confirm to proceed?',
].join('\n');

const PLAN_2OP = [
  'Plan:',
  '1. Withdraw 5 USDC from savings',
  '2. Send 5 USDC to mom',
  '',
  'Confirm to proceed?',
].join('\n');

// [1.14.2] Production logs show the planner ends with "Shall I proceed?"
// roughly as often as "Confirm to proceed?". Both must trigger the
// detector — original pattern only matched "confirm" and silently missed
// every plan with "Shall I proceed?" → wrong model on confirm turn.
const PLAN_2OP_SHALL_PROCEED = [
  'You have $4.66 USDC saved, so the withdrawal is fine. This is a whitelisted withdraw → send pair — I can compile both into one atomic Payment Stream.',
  '',
  'Plan:',
  '1. Withdraw 3 USDC from NAVI savings',
  '2. Send 1 USDC to funkii.sui',
  '',
  'Shall I proceed?',
].join('\n');

const PLAN_3OP_READY_PROCEED = [
  'Quote: 6 USDsui → 6.002667 USDC (0.00% impact via Bluefin).',
  '',
  'Plan:',
  '1. Withdraw 6 USDsui from NAVI',
  '2. Swap → 6.002667 USDC',
  '3. Save USDC into NAVI',
  '',
  'Ready to proceed?',
].join('\n');

const SINGLE_WRITE_PLAN = [
  'Ready to deposit 50 USDC into NAVI savings.',
  '',
  'Confirm to proceed?',
].join('\n');

const NON_PLAN_REPLY = 'Your savings balance is $123.45 across 1 position.';

describe('CONFIRM_PATTERN', () => {
  it.each([
    'yes',
    'Yes',
    'YES',
    'y',
    'Y',
    'ok',
    'Ok',
    'okay',
    'Sure',
    'confirm',
    'Confirm',
    'Confirmed',
    'CONFIRMED',
    'confirms',
    'do it',
    'Do it',
    'go',
    'proceed',
    'approve',
    'Approved',
    "let's do it",
    'lets do it',
    'sounds good',
    'ship it',
    'yep',
    'yeah',
    'yes!',
    'Confirmed.',
    '👍',
  ])('matches confirmation: %s', (msg) => {
    expect(CONFIRM_PATTERN.test(msg)).toBe(true);
  });

  // [Fix 1 / 2026-05-04] Production-observed misses that fell through to the
  // LLM and triggered Haiku-lean rambles. Each row corresponds to a real
  // production session — adding here pins the regression so a future
  // pattern refactor can't silently re-introduce the bug.
  it.each([
    // session s_1777843407792_2b7fc088a8fa @ 21:28:09 (69s ramble)
    'execute',
    'Execute',
    'execute.',
    'execute!',
    // synonym for execute — pre-empted before the next user types it
    'exec',
    'run',
    'Run',
    'fire',
    'Fire',
    'launch',
    'Launch',
    // session s_1777841977869_2f844b8a694a @ 21:19:19 (typo of "confirmed")
    'confimed',
    'Confimed',
    'CONFIMED',
  ])('[Fix 1] matches production-observed affirmative: %s', (msg) => {
    expect(CONFIRM_PATTERN.test(msg)).toBe(true);
  });

  it.each([
    'no',
    'cancel',
    'wait',
    'hold on',
    'not yet',
    "don't do it",
    'change the amount',
    'whats my balance',
    'show me the plan',
    'Confirmed but actually swap less',
    'yes please swap less',
    // [Fix 1] Boundary: synonym words must NOT match when followed by an
    // object — they only fast-path as a bare standalone affirmative.
    'run analytics',
    'execute the audit',
    'fire off the request',
    'launch dashboard',
  ])('does NOT match: %s', (msg) => {
    expect(CONFIRM_PATTERN.test(msg)).toBe(false);
  });
});

describe('countDistinctWriteVerbs', () => {
  it('counts distinct write verbs only', () => {
    expect(countDistinctWriteVerbs(PLAN_3OP)).toBe(3); // withdraw, swap, save
    expect(countDistinctWriteVerbs(PLAN_2OP)).toBe(2); // withdraw, send
    expect(countDistinctWriteVerbs(SINGLE_WRITE_PLAN)).toBe(1); // deposit ("savings" doesn't match \bsave\b)
    expect(countDistinctWriteVerbs(NON_PLAN_REPLY)).toBe(0);
  });

  it('treats repeated occurrences as one', () => {
    expect(countDistinctWriteVerbs('swap 1 swap 2 swap 3')).toBe(1);
  });

  it('matches case-insensitively', () => {
    expect(countDistinctWriteVerbs('SWAP usdc to sui then SAVE it')).toBe(2);
  });
});

describe('detectBundleConfirm', () => {
  describe('positive cases (should promote to medium)', () => {
    it('matches a 3-op Payment Stream plan + "Confirmed"', () => {
      const history: Message[] = [
        userText('withdraw 5 USDC, convert to USDsui, save it'),
        asstText(PLAN_3OP),
      ];
      const result = detectBundleConfirm('Confirmed', history);
      expect(result.matched).toBe(true);
      expect(result.priorWriteVerbCount).toBe(3);
      expect(result.reason).toBe('matched');
    });

    it('matches a 2-op plan + "yes"', () => {
      const history: Message[] = [
        userText('withdraw and send'),
        asstText(PLAN_2OP),
      ];
      const result = detectBundleConfirm('yes', history);
      expect(result.matched).toBe(true);
      expect(result.priorWriteVerbCount).toBe(2);
    });

    it('matches with thumbs-up emoji', () => {
      const history: Message[] = [userText('plan it'), asstText(PLAN_3OP)];
      expect(detectBundleConfirm('👍', history).matched).toBe(true);
    });

    it('[1.14.2] matches a 2-op plan with "Shall I proceed?" tail', () => {
      // Production-observed: session 2 of the 1.14.1 soak. Original
      // pattern missed this entirely → Haiku → guard_block_continue.
      const history: Message[] = [
        userText('Withdraw 3 USDC and send 1 USDC to funkii.sui'),
        asstText(PLAN_2OP_SHALL_PROCEED),
      ];
      const result = detectBundleConfirm('Yes', history);
      expect(result.matched).toBe(true);
      expect(result.priorWriteVerbCount).toBe(2);
      expect(result.reason).toBe('matched');
    });

    it('[1.14.2] matches a 3-op plan with "Ready to proceed?" tail', () => {
      const history: Message[] = [
        userText('withdraw 6 USDsui then swap then save'),
        asstText(PLAN_3OP_READY_PROCEED),
      ];
      const result = detectBundleConfirm('Yes', history);
      expect(result.matched).toBe(true);
      expect(result.priorWriteVerbCount).toBe(3);
    });

    it('skips intervening user messages and matches the most recent assistant', () => {
      const history: Message[] = [
        userText('first request'),
        asstText('Some chitchat without a write plan.'),
        userText('actually withdraw 5 then send 1'),
        asstText(PLAN_2OP),
      ];
      expect(detectBundleConfirm('Confirmed', history).matched).toBe(true);
    });

    it('[Fix 1] matches a 4-op Phase 3a plan + "execute" (production repro)', () => {
      // Repro of session s_1777843407792_2b7fc088a8fa @ 21:28:09 — the
      // 69-second Haiku-ramble. Plan turn proposed a 4-op bundle; user
      // typed "execute" after "proceed"; pre-fix, this skipped the
      // fast-path with `not_affirmative` and burned 7,159 final-text
      // tokens. Post-fix it must match cleanly.
      const PLAN_4OP = [
        'Quotes: 6 USDC → **6.4806 SUI** (0.00% impact via HAEDAL) · 2 USDC → 1.9987 USDsui',
        '',
        'Plan (4-op atomic):',
        '1. Withdraw 9.700979 USDC from savings',
        '2. Withdraw 0.001 USDsui from savings',
        '3. Swap 6 USDC → ~6.4806 SUI',
        '4. Swap 2 USDC → ~1.9987 USDsui',
        '',
        'Confirm to proceed?',
      ].join('\n');
      const history: Message[] = [
        userText('Withdraw all from savings, swap 6 USDC to SUI, swap 2 USDC to USDsui'),
        asstText(PLAN_4OP),
      ];
      const result = detectBundleConfirm('execute', history);
      expect(result.matched).toBe(true);
      expect(result.priorWriteVerbCount).toBe(2); // withdraw, swap
      expect(result.reason).toBe('matched');
    });

    it('[Fix 1] matches a 2-op plan + "confimed" typo (production repro)', () => {
      // Repro of session s_1777841977869_2f844b8a694a @ 21:19:19. User
      // typed "confimed" (missing 'r'); pre-fix, fast-path skipped.
      const history: Message[] = [
        userText('swap 0.1 USDsui to USDC and save the USDC'),
        asstText(PLAN_2OP),
      ];
      const result = detectBundleConfirm('confimed', history);
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('matched');
    });
  });

  describe('negative cases (should NOT promote)', () => {
    it('rejects empty history', () => {
      expect(detectBundleConfirm('Confirmed', []).matched).toBe(false);
      expect(detectBundleConfirm('Confirmed', []).reason).toBe('no-history');
    });

    it('rejects long messages even if they look like confirmations', () => {
      const history: Message[] = [asstText(PLAN_3OP)];
      const longMsg = 'Confirmed but please double-check the swap quote first';
      expect(detectBundleConfirm(longMsg, history).matched).toBe(false);
    });

    it('rejects non-confirmation short messages', () => {
      const history: Message[] = [asstText(PLAN_3OP)];
      expect(detectBundleConfirm('What is HF?', history).reason).toBe('not-short-confirm');
      expect(detectBundleConfirm('cancel', history).reason).toBe('not-short-confirm');
      expect(detectBundleConfirm('no', history).reason).toBe('not-short-confirm');
    });

    it('rejects when the prior assistant message lacks the "confirm" marker', () => {
      const planNoConfirm = [
        'Plan:',
        '1. Withdraw 5 USDC',
        '2. Swap to USDsui',
        '3. Save it',
      ].join('\n');
      const history: Message[] = [asstText(planNoConfirm)];
      const result = detectBundleConfirm('Confirmed', history);
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('no-confirm-marker');
    });

    it('rejects when the prior assistant has the marker but only ONE distinct write verb', () => {
      const onlySwap = 'Will swap 5 USDC to SUI. Confirm to proceed?';
      const history: Message[] = [asstText(onlySwap)];
      const result = detectBundleConfirm('Confirmed', history);
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('fewer-than-two-writes');
      expect(result.priorWriteVerbCount).toBe(1);
    });

    it('rejects when prior assistant has no text content', () => {
      const history: Message[] = [
        userText('hello'),
        { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'balance_check', input: {} }] },
      ];
      expect(detectBundleConfirm('Confirmed', history).reason).toBe('no-prior-assistant');
    });

    it('rejects when there is no prior assistant turn at all', () => {
      const history: Message[] = [userText('first user message')];
      expect(detectBundleConfirm('Confirmed', history).reason).toBe('no-prior-assistant');
    });

    it('does NOT promote a single-write confirm', () => {
      // Single-write plans should stay on Haiku — Haiku handles one
      // tool_use just fine. Promotion is reserved for the multi-write case
      // where Haiku reliably emits one-at-a-time and round-trips.
      const history: Message[] = [asstText(SINGLE_WRITE_PLAN)];
      const result = detectBundleConfirm('Confirmed', history);
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('fewer-than-two-writes');
      expect(result.priorWriteVerbCount).toBe(1);
    });

    it('does NOT promote when the conversation is purely informational', () => {
      const history: Message[] = [
        userText('whats my balance'),
        asstText('Your wallet has 10 USDC and 1.2 SUI. Net worth: $12.30'),
      ];
      const result = detectBundleConfirm('Confirmed', history);
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('no-confirm-marker');
    });
  });
});
