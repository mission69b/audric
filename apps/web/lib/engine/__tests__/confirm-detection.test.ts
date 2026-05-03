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

    it('skips intervening user messages and matches the most recent assistant', () => {
      const history: Message[] = [
        userText('first request'),
        asstText('Some chitchat without a write plan.'),
        userText('actually withdraw 5 then send 1'),
        asstText(PLAN_2OP),
      ];
      expect(detectBundleConfirm('Confirmed', history).matched).toBe(true);
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
