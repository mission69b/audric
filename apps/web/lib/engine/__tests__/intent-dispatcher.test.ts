import { describe, it, expect } from 'vitest';
import {
  classifyReadIntents,
  makeAutoDispatchId,
  intentDiscriminator,
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
  it('every rule has a unique (toolName, pattern.source) pair', () => {
    // [v0.46.9] toolName is no longer unique — transaction_history has
    // multiple rules (last/today/yesterday). Uniqueness is now on
    // (toolName, pattern.source) so we still catch accidental duplicates.
    const keys = __testOnly__.READ_INTENT_RULES.map(
      (r) => `${r.toolName}::${r.pattern.source}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every rule has a non-empty pattern and label', () => {
    for (const rule of __testOnly__.READ_INTENT_RULES) {
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(rule.label.length).toBeGreaterThan(0);
    }
  });

  it('every rule has either static args or an argsBuilder', () => {
    for (const rule of __testOnly__.READ_INTENT_RULES) {
      const hasArgs = rule.args !== undefined;
      const hasBuilder = typeof rule.argsBuilder === 'function';
      expect(hasArgs || hasBuilder).toBe(true);
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

// ─────────────────────── v0.46.9 — extended intents ────────────────────────

describe('classifyReadIntents — transaction_history (last single tx)', () => {
  it.each([
    'What was my last transaction?',
    "What's my last transaction?",
    'My last transaction',
    'show my last transaction',
    'show me my last transaction',
    'my last tx',
  ])('matches: %s → { limit: 1 }', (msg) => {
    const intents = classifyReadIntents(msg);
    const tx = intents.find((i) => i.toolName === 'transaction_history');
    expect(tx).toBeDefined();
    expect(tx!.args).toEqual({ limit: 1 });
  });

  it.each([
    'Show my last 5 transactions',
    'show me my last 10 transactions',
    'my last transactions',
    'last transactions',
    "yesterday's transactions",
  ])('does NOT match singular last-tx rule: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    const tx = intents.find(
      (i) =>
        i.toolName === 'transaction_history' &&
        JSON.stringify(i.args) === '{"limit":1}',
    );
    expect(tx).toBeUndefined();
  });
});

describe("classifyReadIntents — transaction_history (today's activity)", () => {
  it.each([
    "Show today's activity",
    'Show me today’s activity',
    "today's transactions",
    'today’s tx',
    'What did I do today?',
    "show me today's transactions",
  ])('matches: %s → { date: today }', (msg) => {
    const intents = classifyReadIntents(msg);
    const tx = intents.find((i) => i.toolName === 'transaction_history');
    expect(tx).toBeDefined();
    expect(tx!.args.date).toBe(__testOnly__.isoDateOffset(0));
  });
});

describe("classifyReadIntents — transaction_history (yesterday's activity)", () => {
  it.each([
    'What did I do yesterday?',
    "Yesterday's activity",
    "show yesterday's transactions",
    'show me yesterday’s activity',
    'What happened yesterday?',
  ])('matches: %s → { date: yesterday }', (msg) => {
    const intents = classifyReadIntents(msg);
    const tx = intents.find((i) => i.toolName === 'transaction_history');
    expect(tx).toBeDefined();
    expect(tx!.args.date).toBe(__testOnly__.isoDateOffset(-1));
  });
});

describe('classifyReadIntents — activity_summary (services spend)', () => {
  it.each([
    'What did I spend on services this month?',
    'How much did I spend on services?',
    'What have I spent on APIs?',
    'What did I spend on MPP services this month?',
    'How much have I paid for services?',
  ])('matches: %s → { period: month }', (msg) => {
    const intents = classifyReadIntents(msg);
    const summary = intents.find((i) => i.toolName === 'activity_summary');
    expect(summary).toBeDefined();
    expect(summary!.args).toEqual({ period: 'month' });
  });

  it.each([
    'spend $5 on the translate service', // write-ish intent
    'show me available services', // catalog query
    'what services do you have', // catalog query
  ])('does NOT match: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    expect(intents.map((i) => i.toolName)).not.toContain('activity_summary');
  });
});

describe('classifyReadIntents — yield_summary (yield direct read)', () => {
  it.each([
    'Show my yield earnings',
    'Show my yield',
    "What's my yield?",
    "What's my yield this month?",
    'What is my current yield?',
    'My yield earnings',
    'How much have I earned?',
    'How much am I earning?',
    'My earnings',
  ])('matches: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    expect(intents.map((i) => i.toolName)).toContain('yield_summary');
  });

  it.each([
    'high yield pools',
    'yield farming strategies on Sui',
    'show me yields on Sui', // market query
    'what is the USDC yield', // market query, not personal
  ])('does NOT match: %s', (msg) => {
    const intents = classifyReadIntents(msg);
    expect(intents.map((i) => i.toolName)).not.toContain('yield_summary');
  });
});

describe('classifyReadIntents — same-tool/different-args dedup', () => {
  it('allows transaction_history to fire twice with different args', () => {
    // Compound prompt: today + yesterday → should produce two distinct
    // intents both targeting transaction_history.
    const intents = classifyReadIntents(
      "What did I do today and what did I do yesterday?",
    );
    const txIntents = intents.filter(
      (i) => i.toolName === 'transaction_history',
    );
    expect(txIntents.length).toBeGreaterThanOrEqual(2);
    const dates = txIntents.map((i) => i.args.date);
    expect(dates).toContain(__testOnly__.isoDateOffset(0));
    expect(dates).toContain(__testOnly__.isoDateOffset(-1));
  });

  it('still dedupes identical (toolName, args) pairs', () => {
    // Two phrasings that both produce { limit: 1 } — should fire once.
    const intents = classifyReadIntents(
      "What was my last transaction? Show my last tx.",
    );
    const txIntents = intents.filter(
      (i) =>
        i.toolName === 'transaction_history' &&
        JSON.stringify(i.args) === '{"limit":1}',
    );
    expect(txIntents).toHaveLength(1);
  });
});

describe('isoDateOffset', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(__testOnly__.isoDateOffset(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(__testOnly__.isoDateOffset(-1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('produces yesterday < today < tomorrow', () => {
    const yesterday = __testOnly__.isoDateOffset(-1);
    const today = __testOnly__.isoDateOffset(0);
    const tomorrow = __testOnly__.isoDateOffset(1);
    expect(yesterday < today).toBe(true);
    expect(today < tomorrow).toBe(true);
  });
});

describe('intentDiscriminator', () => {
  it('returns empty string for no-arg intents (preserves auto_<turn>_<tool> ID)', () => {
    expect(
      intentDiscriminator({ toolName: 'balance_check', args: {}, label: 'x' }),
    ).toBe('');
  });

  it('returns a non-empty token for args-bearing intents', () => {
    const d = intentDiscriminator({
      toolName: 'transaction_history',
      args: { limit: 1 },
      label: 'x',
    });
    expect(d.length).toBeGreaterThan(0);
  });

  it('produces stable output for equivalent args (key order independent)', () => {
    const a = intentDiscriminator({
      toolName: 'transaction_history',
      args: { limit: 1, date: '2026-04-19' },
      label: 'x',
    });
    const b = intentDiscriminator({
      toolName: 'transaction_history',
      args: { date: '2026-04-19', limit: 1 },
      label: 'x',
    });
    expect(a).toBe(b);
  });

  it('produces different output for different args', () => {
    const today = intentDiscriminator({
      toolName: 'transaction_history',
      args: { date: '2026-04-19' },
      label: 'x',
    });
    const yesterday = intentDiscriminator({
      toolName: 'transaction_history',
      args: { date: '2026-04-18' },
      label: 'x',
    });
    expect(today).not.toBe(yesterday);
  });
});

describe('makeAutoDispatchId — discriminator support', () => {
  it('appends discriminator when provided', () => {
    expect(makeAutoDispatchId(3, 'transaction_history', 'abc123')).toBe(
      'auto_3_transaction_history_abc123',
    );
  });

  it('omits discriminator suffix when empty', () => {
    expect(makeAutoDispatchId(3, 'balance_check', '')).toBe(
      'auto_3_balance_check',
    );
  });

  it('two intents same tool different discriminator → different IDs', () => {
    const a = makeAutoDispatchId(5, 'transaction_history', 'today');
    const b = makeAutoDispatchId(5, 'transaction_history', 'yesterday');
    expect(a).not.toBe(b);
  });
});
