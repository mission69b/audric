import { describe, it, expect } from 'vitest';
import {
  classifyReadIntents,
  makeAutoDispatchId,
  __testOnly__,
} from '../intent-dispatcher';

describe('classifyReadIntents — balance_check', () => {
  it.each([
    "What's my net worth?",
    'What is my net worth?',
    'My net worth?',
    'net worth',
    "What's my balance?",
    'What is my balance?',
    'show me my balance',
    'Show my balance',
    'My balance',
    'my wallet',
    'my holdings',
    'How much do I have?',
    'how much am I holding',
    'How much is in my wallet?',
    "What's in my wallet?",
    "What's my total balance?",
    'What is my total balance',
  ])('matches: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    expect(intents.map((i) => i.toolName)).toContain('balance_check');
  });

  it.each([
    'balance the books',
    'find a healthy balance',
    'rebalance my portfolio',
    'your balance is low',
    'the balance sheet looks good',
    'work-life balance',
  ])('does NOT match: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    expect(intents.map((i) => i.toolName)).not.toContain('balance_check');
  });
});

describe('classifyReadIntents — health_check', () => {
  it.each([
    "What's my health factor?",
    'My health factor',
    'health factor',
    'Am I at risk of liquidation?',
    'Risk of liquidation',
    'liquidation risk',
    'liquidation',
    'Am I safe?',
    'is my account safe?',
    "What's my borrow capacity?",
    'borrowing capacity',
    'Can I borrow?',
    'Can I borrow more?',
    'How much can I borrow?',
    'max borrow',
    'maximum borrow',
    'Run a full health check on my account',
    'full health check',
    'health check',
    'health check on my account',
    'check my account health',
    'check my health',
    'Run a health check',
  ])('matches: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    expect(intents.map((i) => i.toolName)).toContain('health_check');
  });

  it.each([
    'the health of the protocol',
    "how's the market health",
    'mental health is important',
    'health insurance',
    'borrow some books',
  ])('does NOT match: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    expect(intents.map((i) => i.toolName)).not.toContain('health_check');
  });
});

describe('classifyReadIntents — mpp_services', () => {
  it.each([
    'Show me available MPP services',
    'available MPP services',
    'Show all available MPP services',
    'Show me MPP services',
    'show me all MPP services',
    'MPP services',
    'List MPP services',
    'list all MPP services',
    'What MPP services exist?',
    'What MPP services exist on Sui?',
    'What services are available?',
    'What services do you have?',
    'show me the service catalog',
    'service catalog',
  ])('matches: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    expect(intents.map((i) => i.toolName)).toContain('mpp_services');
  });

  it.each([
    'use the translate service',
    'create a payment service',
    'send to my friend',
    'show me my services usage', // ambiguous — let LLM handle
  ])('does NOT match: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    expect(intents.map((i) => i.toolName)).not.toContain('mpp_services');
  });
});

describe('classifyReadIntents — compound + edge cases', () => {
  it('returns empty for empty/whitespace input', () => {
    expect(classifyReadIntents('')).toEqual([]);
    expect(classifyReadIntents('   ')).toEqual([]);
    expect(classifyReadIntents(undefined as unknown as string)).toEqual([]);
    expect(classifyReadIntents(null as unknown as string)).toEqual([]);
  });

  it('returns empty for unrelated messages', () => {
    expect(classifyReadIntents('Hello, how are you?')).toEqual([]);
    expect(classifyReadIntents('Send 5 USDC to alice.sui')).toEqual([]);
    expect(classifyReadIntents('Create a payment link for $10')).toEqual([]);
    expect(classifyReadIntents('Cancel my last invoice')).toEqual([]);
  });

  it('matches multiple intents in one message (compound)', () => {
    const intents = classifyReadIntents("What's my balance and health factor?");
    const tools = intents.map((i) => i.toolName);
    expect(tools).toContain('balance_check');
    expect(tools).toContain('health_check');
  });

  it('deduplicates intents — same tool only fires once', () => {
    // "balance" + "wallet" both match balance_check
    const intents = classifyReadIntents("What's my balance? Show my wallet.");
    const balanceMatches = intents.filter((i) => i.toolName === 'balance_check');
    expect(balanceMatches).toHaveLength(1);
  });

  it('returns intents in registration order (balance, health, mpp)', () => {
    const intents = classifyReadIntents(
      'Show me my balance, my health factor, and available MPP services',
    );
    expect(intents.map((i) => i.toolName)).toEqual([
      'balance_check',
      'health_check',
      'mpp_services',
    ]);
  });

  it('is case-insensitive', () => {
    expect(
      classifyReadIntents('NET WORTH').some((i) => i.toolName === 'balance_check'),
    ).toBe(true);
    expect(
      classifyReadIntents('HEALTH FACTOR').some((i) => i.toolName === 'health_check'),
    ).toBe(true);
  });

  it('preserves args as a fresh object per call (no shared reference bug)', () => {
    const a = classifyReadIntents("What's my balance?")[0];
    const b = classifyReadIntents("What's my balance?")[0];
    expect(a.args).not.toBe(b.args);
    expect(a.args).toEqual(b.args);
  });

  it('attaches a human-readable label', () => {
    const [intent] = classifyReadIntents("What's my net worth?");
    expect(intent.label).toMatch(/balance|net.worth/i);
  });
});

describe('makeAutoDispatchId', () => {
  it('produces stable IDs given the same inputs', () => {
    expect(makeAutoDispatchId(3, 'balance_check')).toBe(
      makeAutoDispatchId(3, 'balance_check'),
    );
  });

  it('differs across turn index', () => {
    expect(makeAutoDispatchId(3, 'balance_check')).not.toBe(
      makeAutoDispatchId(4, 'balance_check'),
    );
  });

  it('differs across tool name', () => {
    expect(makeAutoDispatchId(3, 'balance_check')).not.toBe(
      makeAutoDispatchId(3, 'health_check'),
    );
  });

  it('uses the auto_ prefix so harness-metrics can identify pre-dispatched calls', () => {
    expect(makeAutoDispatchId(7, 'mpp_services')).toMatch(/^auto_/);
  });
});

describe('READ_INTENT_RULES — registry sanity', () => {
  it('every rule has a unique toolName', () => {
    const tools = __testOnly__.READ_INTENT_RULES.map((r) => r.toolName);
    expect(new Set(tools).size).toBe(tools.length);
  });

  it('every rule has a non-empty pattern and label', () => {
    for (const rule of __testOnly__.READ_INTENT_RULES) {
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.label.length).toBeGreaterThan(0);
    }
  });

  it('all current rules cover read-only tools (defensive)', () => {
    const READ_ONLY_TOOLS = new Set([
      'balance_check',
      'savings_info',
      'health_check',
      'transaction_history',
      'rates_info',
      'mpp_services',
      'list_payment_links',
      'list_invoices',
      'defillama_yield_pools',
      'portfolio_analysis',
      'activity_summary',
      'yield_summary',
    ]);
    for (const rule of __testOnly__.READ_INTENT_RULES) {
      expect(READ_ONLY_TOOLS.has(rule.toolName)).toBe(true);
    }
  });
});
