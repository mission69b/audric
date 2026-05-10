import { describe, expect, it } from 'vitest';
import { convertSessionMessages } from './route';

const T0 = 1_700_000_000_000;

describe('convertSessionMessages — directive stripping (spec_session_refresh_chat_divergence)', () => {
  it('drops the [session bootstrap] sentinel message entirely (no empty user bubble)', () => {
    const messages = [
      // Audric's session bootstrap pattern.
      { role: 'user' as const, content: [{ type: 'text', text: '[session bootstrap]' }] },
      {
        role: 'assistant' as const,
        content: [
          { type: 'tool_use', name: 'balance_check', id: 'etch_bal', input: {} },
        ],
      },
      {
        role: 'user' as const,
        content: [
          { type: 'tool_result', toolUseId: 'etch_bal', content: '{"total":10}', isError: false },
        ],
      },
      {
        role: 'assistant' as const,
        content: [{ type: 'text', text: 'Session data loaded.' }],
      },
      // First real user prompt.
      { role: 'user' as const, content: [{ type: 'text', text: 'whats my balance' }] },
      {
        role: 'assistant' as const,
        content: [{ type: 'text', text: 'You have $10.' }],
      },
    ];

    const result = convertSessionMessages(messages, T0);

    // Bootstrap user message dropped.
    // Bootstrap assistant "Session data loaded." kept (it's a real
    // narration the user briefly sees on the live surface).
    const userMessages = result.filter((m) => m.role === 'user');
    expect(userMessages.map((m) => m.content)).toEqual(['whats my balance']);
  });

  it('strips a <post_write_anchor> prefix from a user message', () => {
    const messages = [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text',
            text:
              '<post_write_anchor>\nA write executed earlier in this session. The freshest balance_check / savings_info result in your conversation history is at turn 40 (most recent in your context).\n</post_write_anchor> swap 1 usdc to gold',
          },
        ],
      },
      {
        role: 'assistant' as const,
        content: [{ type: 'text', text: 'Quote: 1 USDC → 0.000213 GOLD' }],
      },
    ];

    const result = convertSessionMessages(messages, T0);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ role: 'user', content: 'swap 1 usdc to gold' });
    expect(result[1]).toMatchObject({ role: 'assistant', content: 'Quote: 1 USDC → 0.000213 GOLD' });
  });

  it('strips multiple <canonical_route> blocks from a single user message (bundle case)', () => {
    const messages = [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text',
            text:
              '<canonical_route>\n- Pair: USDC → SUI\n- Path: BLUEFIN + CETUS\n</canonical_route>\n<canonical_route>\n- Pair: USDC → GOLD\n- Path: BLUEFIN\n</canonical_route>',
          },
          {
            type: 'tool_result',
            toolUseId: 'pwr_bal',
            content: '{"total":91}',
            isError: false,
          },
        ],
      },
      {
        role: 'assistant' as const,
        content: [{ type: 'text', text: 'Bundle executed. Swapped...' }],
      },
    ];

    const result = convertSessionMessages(messages, T0);

    // The user-message text was 100% directives — drop the user
    // message entirely (no empty bubble). Only the assistant's
    // narration survives.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ role: 'assistant' });
  });

  it('leaves untouched a normal user message with no directive prefix', () => {
    const messages = [
      { role: 'user' as const, content: [{ type: 'text', text: 'Can you swap half of my usdsui for usdc' }] },
      { role: 'assistant' as const, content: [{ type: 'text', text: 'Sure.' }] },
    ];

    const result = convertSessionMessages(messages, T0);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Can you swap half of my usdsui for usdc');
  });

  it('preserves message ordering + assistant tool-use rehydration after stripping', () => {
    // End-to-end shape mirroring the user's repro: bootstrap →
    // bootstrap reply → user prompt with anchor prefix → assistant
    // tool_use → user tool_result → assistant narration.
    const messages = [
      { role: 'user' as const, content: [{ type: 'text', text: '[session bootstrap]' }] },
      {
        role: 'assistant' as const,
        content: [{ type: 'text', text: 'Session data loaded.' }],
      },
      {
        role: 'user' as const,
        content: [
          {
            type: 'text',
            text: '<post_write_anchor>foo bar</post_write_anchor> swap 1 usdc to deep',
          },
        ],
      },
      {
        role: 'assistant' as const,
        content: [
          { type: 'tool_use', name: 'swap_quote', id: 'q1', input: { from: 'USDC', to: 'DEEP' } },
        ],
      },
      {
        role: 'user' as const,
        content: [
          { type: 'tool_result', toolUseId: 'q1', content: '{"out":"28"}', isError: false },
        ],
      },
      {
        role: 'assistant' as const,
        content: [{ type: 'text', text: 'Quote: 1 USDC → 28 DEEP.' }],
      },
    ];

    const result = convertSessionMessages(messages, T0);

    // Expected: bootstrap dropped, "Session data loaded." narration
    // kept, anchor-prefixed user message cleaned, assistant tool_use
    // attached with its tool_result.
    expect(result.map((m) => `${m.role}:${m.content}`)).toEqual([
      'assistant:Session data loaded.',
      'user:swap 1 usdc to deep',
      'assistant:',
      'assistant:Quote: 1 USDC → 28 DEEP.',
    ]);

    // Tool attached on the swap_quote assistant message.
    const swapQuoteMsg = result[2];
    expect(swapQuoteMsg.tools).toHaveLength(1);
    expect(swapQuoteMsg.tools![0].toolName).toBe('swap_quote');
    expect(swapQuoteMsg.tools![0].status).toBe('done');
  });
});
