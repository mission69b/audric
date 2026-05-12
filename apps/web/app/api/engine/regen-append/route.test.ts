/**
 * SPEC 23B-MPP6-fastpath / 2026-05-12 — appendRegenToMessages tests.
 *
 * The pure helper does the heavy lifting (find/anchor/insert, alternation
 * preservation, collision detection). The route handler is a thin
 * auth+rate-limit+persistence wrapper. Testing the helper covers the
 * regression surface that matters; route smoke is covered by the
 * integration test in P5.
 */

import { describe, it, expect } from 'vitest';
import type { Message } from '@t2000/engine';
import { appendRegenToMessages } from './helper';

function makeBaseSession(): Message[] {
  return [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Generate a sunset image' }],
    },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: "I'll create that for you." },
        {
          type: 'tool_use',
          id: 'orig_pay_001',
          name: 'pay_api',
          input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations', body: '{"prompt":"sunset"}' },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          toolUseId: 'orig_pay_001',
          content: JSON.stringify({ success: true, status: 200, body: { url: 'https://example.com/image1.png' } }),
        },
      ],
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: "Here's your sunset image: ..." }],
    },
  ];
}

describe('appendRegenToMessages', () => {
  it('happy path: appends tool_use to assistant + tool_result to user, preserves alternation', () => {
    const messages = makeBaseSession();
    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations', body: '{"prompt":"sunset"}' },
      payApiResult: { success: true, status: 200, body: { url: 'https://example.com/image2.png' } },
      isError: false,
    });

    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.messages.length).toBe(messages.length); // no new messages

    // Alternation preserved: user → assistant → user → assistant
    expect(result.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);

    // Assistant message at index 1 now has tool_use:regen_pay_002 appended
    const updatedAssistant = result.messages[1];
    expect(updatedAssistant.role).toBe('assistant');
    const toolUseBlocks = updatedAssistant.content.filter((b) => b.type === 'tool_use');
    expect(toolUseBlocks.length).toBe(2);
    expect(toolUseBlocks[0]).toMatchObject({ id: 'orig_pay_001' });
    expect(toolUseBlocks[1]).toMatchObject({
      id: 'regen_pay_002',
      name: 'pay_api',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations', body: '{"prompt":"sunset"}' },
    });

    // User message at index 2 now has tool_result:regen_pay_002 appended
    const updatedUser = result.messages[2];
    expect(updatedUser.role).toBe('user');
    const toolResultBlocks = updatedUser.content.filter((b) => b.type === 'tool_result');
    expect(toolResultBlocks.length).toBe(2);
    expect(toolResultBlocks[0]).toMatchObject({ toolUseId: 'orig_pay_001' });
    expect(toolResultBlocks[1]).toMatchObject({
      toolUseId: 'regen_pay_002',
      isError: false,
    });
    // tool_result.content is JSON-stringified
    if (toolResultBlocks[1].type === 'tool_result') {
      const parsed = JSON.parse(toolResultBlocks[1].content);
      expect(parsed.body.url).toBe('https://example.com/image2.png');
    }
  });

  it('preserves the trailing assistant text message ("Here\'s your sunset image…")', () => {
    const messages = makeBaseSession();
    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: { success: true },
      isError: false,
    });

    if ('error' in result) throw new Error('expected success');
    expect(result.messages[3].role).toBe('assistant');
    expect(result.messages[3].content[0]).toMatchObject({
      type: 'text',
      text: "Here's your sunset image: ...",
    });
  });

  it('does NOT mutate the input messages array (immutability guarantee)', () => {
    const messages = makeBaseSession();
    const originalAssistantContent = messages[1].content;
    const originalUserContent = messages[2].content;

    appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: { success: true },
      isError: false,
    });

    expect(messages[1].content).toBe(originalAssistantContent);
    expect(messages[2].content).toBe(originalUserContent);
    expect(messages[1].content.length).toBe(2);
    expect(messages[2].content.length).toBe(1);
  });

  it('persists isError: true when regen failed (preserves history accuracy)', () => {
    const messages = makeBaseSession();
    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: { success: false, error: 'Gateway 500', paymentConfirmed: true },
      isError: true,
    });

    if ('error' in result) throw new Error('expected success');
    const userMsg = result.messages[2];
    const newResult = userMsg.content.filter((b) => b.type === 'tool_result')[1];
    expect(newResult).toMatchObject({ toolUseId: 'regen_pay_002', isError: true });
    if (newResult.type === 'tool_result') {
      const parsed = JSON.parse(newResult.content);
      expect(parsed.success).toBe(false);
      expect(parsed.paymentConfirmed).toBe(true);
    }
  });

  it('handles string payApiResult without double-stringifying', () => {
    const messages = makeBaseSession();
    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: 'plain text result',
      isError: false,
    });

    if ('error' in result) throw new Error('expected success');
    const newResult = result.messages[2].content.filter((b) => b.type === 'tool_result')[1];
    if (newResult.type === 'tool_result') {
      expect(newResult.content).toBe('plain text result');
    }
  });

  it('multiple regens of the same original: each appends to the same assistant + user pair', () => {
    let messages = makeBaseSession();

    const r1 = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: { success: true, body: { url: 'image2.png' } },
      isError: false,
    });
    if ('error' in r1) throw new Error('expected success');
    messages = r1.messages;

    const r2 = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_003',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: { success: true, body: { url: 'image3.png' } },
      isError: false,
    });
    if ('error' in r2) throw new Error('expected success');

    const finalAssistant = r2.messages[1];
    const toolUses = finalAssistant.content.filter((b) => b.type === 'tool_use');
    expect(toolUses.length).toBe(3);
    expect(toolUses.map((b) => b.type === 'tool_use' && b.id)).toEqual([
      'orig_pay_001',
      'regen_pay_002',
      'regen_pay_003',
    ]);

    const finalUser = r2.messages[2];
    const toolResults = finalUser.content.filter((b) => b.type === 'tool_result');
    expect(toolResults.length).toBe(3);
  });

  it('rejects when originalToolUseId is not found anywhere in messages → 404', () => {
    const messages = makeBaseSession();
    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'nonexistent_id',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: {},
      isError: false,
    });
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.status).toBe(404);
    expect(result.error).toContain('not found');
  });

  it('rejects when newToolUseId collides with an existing tool_use → 409', () => {
    const messages = makeBaseSession();
    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'orig_pay_001', // collision: same as the original
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: {},
      isError: false,
    });
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.status).toBe(409);
    expect(result.error).toContain('collides');
  });

  it('rejects when newToolUseId collides with an existing tool_result → 409', () => {
    const messages = makeBaseSession();
    // Inject a tool_result whose toolUseId we'll try to collide with
    messages[2].content.push({
      type: 'tool_result',
      toolUseId: 'orphaned_result_001',
      content: '{}',
    });

    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'orphaned_result_001', // collides with the tool_result above
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: {},
      isError: false,
    });
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.status).toBe(409);
  });

  it('rejects when assistant has tool_use but no following user message → 409', () => {
    // Trim the session so the original assistant is the LAST message
    const messages = makeBaseSession().slice(0, 2);
    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: {},
      isError: false,
    });
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.status).toBe(409);
    expect(result.error).toContain('no following user message');
  });

  it('rejects when following user message lacks tool_result for original → 409', () => {
    const messages = makeBaseSession();
    // Strip the matching tool_result
    messages[2] = {
      ...messages[2],
      content: [{ type: 'text', text: 'corrupted user message' }],
    };

    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: {},
      isError: false,
    });
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.status).toBe(409);
    expect(result.error).toContain('history corrupted');
  });

  it('finds the FIRST occurrence when originalToolUseId appears in multiple assistants (defensive)', () => {
    // Defensive case: shouldn't happen in practice (toolUseIds are
    // unique by construction), but if it does, we anchor on the first.
    const messages: Message[] = [
      ...makeBaseSession(),
      // Synthetic duplicate
      {
        role: 'user',
        content: [{ type: 'text', text: 'hmm' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'orig_pay_001', // duplicate ID
            name: 'pay_api',
            input: {},
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'orig_pay_001', content: '{}' },
        ],
      },
    ];

    const result = appendRegenToMessages(messages, {
      originalToolUseId: 'orig_pay_001',
      newToolUseId: 'regen_pay_002',
      input: { url: 'https://mpp.t2000.ai/openai/v1/images/generations' },
      payApiResult: {},
      isError: false,
    });

    if ('error' in result) throw new Error('expected success');
    // First assistant (index 1) should have 2 tool_uses; the second
    // assistant (index 5) should remain unchanged with 1 tool_use.
    const firstAssistantToolUses = result.messages[1].content.filter((b) => b.type === 'tool_use');
    expect(firstAssistantToolUses.length).toBe(2);
    const secondAssistantToolUses = result.messages[5].content.filter((b) => b.type === 'tool_use');
    expect(secondAssistantToolUses.length).toBe(1);
  });
});
