import { describe, expect, it } from 'vitest';
import { findToolByToolUseId, type FindToolMessage } from './find-tool-by-id';

const PAY_API_URL = 'https://mpp.t2000.ai/openai/v1/images/generations';
const PAY_API_BODY = '{"prompt":"sunset over mountains","model":"dall-e-3"}';

function payApiInput(extra: Record<string, unknown> = {}) {
  return { url: PAY_API_URL, body: PAY_API_BODY, maxPrice: 0.05, ...extra };
}

describe('findToolByToolUseId — three-source priority', () => {
  it('source 1: returns tool block from timeline[] when present (mergeWriteExecutionIntoTimeline path)', () => {
    const messages: FindToolMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        timeline: [
          {
            type: 'tool',
            toolUseId: 'tu_abc',
            toolName: 'pay_api',
            input: payApiInput(),
            result: { paid: true, cost: 0.05 },
          },
        ],
        tools: [
          {
            toolUseId: 'tu_abc',
            toolName: 'pay_api',
            input: {},
            result: { paid: true, cost: 0.05 },
          },
        ],
      },
    ];

    const out = findToolByToolUseId(messages, 'tu_abc');
    expect(out).not.toBeNull();
    expect(out!.messageId).toBe('m1');
    expect(out!.tool.toolName).toBe('pay_api');
    expect((out!.tool.input as { url: string }).url).toBe(PAY_API_URL);
  });

  it('source 2: falls back to tools[] when timeline lacks the tool block (root-fix path with pendingInputsRef recovery)', () => {
    const messages: FindToolMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        timeline: [],
        tools: [
          {
            toolUseId: 'tu_abc',
            toolName: 'pay_api',
            input: payApiInput(),
            result: { paid: true, cost: 0.05 },
          },
        ],
      },
    ];

    const out = findToolByToolUseId(messages, 'tu_abc');
    expect(out).not.toBeNull();
    expect((out!.tool.input as { url: string }).url).toBe(PAY_API_URL);
  });

  it('source 3: falls back to permission-card.payload.input when both timeline tool block and tools[] are missing/empty', () => {
    const messages: FindToolMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        timeline: [
          {
            type: 'permission-card',
            payload: {
              toolUseId: 'tu_abc',
              toolName: 'pay_api',
              input: payApiInput(),
            },
          },
        ],
        tools: [],
      },
    ];

    const out = findToolByToolUseId(messages, 'tu_abc');
    expect(out).not.toBeNull();
    expect(out!.tool.toolName).toBe('pay_api');
    expect((out!.tool.input as { url: string }).url).toBe(PAY_API_URL);
  });

  it('returns null when no source has the toolUseId', () => {
    const messages: FindToolMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        timeline: [
          {
            type: 'tool',
            toolUseId: 'tu_xyz',
            toolName: 'balance_check',
            input: {},
          },
        ],
        tools: [],
      },
    ];

    expect(findToolByToolUseId(messages, 'tu_abc')).toBeNull();
  });

  it('walks newest-to-oldest and returns the first match', () => {
    const messages: FindToolMessage[] = [
      {
        id: 'm_old',
        role: 'assistant',
        timeline: [
          {
            type: 'tool',
            toolUseId: 'tu_abc',
            toolName: 'pay_api',
            input: payApiInput({ body: 'OLD' }),
          },
        ],
      },
      {
        id: 'm_user',
        role: 'user',
      },
      {
        id: 'm_new',
        role: 'assistant',
        timeline: [
          {
            type: 'tool',
            toolUseId: 'tu_abc',
            toolName: 'pay_api',
            input: payApiInput({ body: 'NEW' }),
          },
        ],
      },
    ];

    const out = findToolByToolUseId(messages, 'tu_abc');
    expect(out!.messageId).toBe('m_new');
    expect((out!.tool.input as { body: string }).body).toBe('NEW');
  });

  it('skips user messages even if they accidentally carry tool blocks', () => {
    const messages: FindToolMessage[] = [
      {
        id: 'm_user',
        role: 'user',
        timeline: [
          {
            type: 'tool',
            toolUseId: 'tu_abc',
            toolName: 'pay_api',
            input: payApiInput(),
          },
        ],
      },
    ];

    expect(findToolByToolUseId(messages, 'tu_abc')).toBeNull();
  });

  it('regression: does NOT return source 1 when timeline tool block has empty input — falls through to source 2', () => {
    // [SPEC 23B-MPP6-fastpath / 2026-05-12] This is the bug-class
    // assertion. Pre-root-fix, tools[].input was {} for confirm-tier
    // writes. The timeline-priority fix (303c6b3) prevented falling
    // through to that lossy source by reading timeline first. The
    // root fix (this commit) makes tools[].input correct too.
    //
    // Either way, when timeline DOES have the tool block with valid
    // input, source 1 wins and we never see {}.
    const messages: FindToolMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        timeline: [
          {
            type: 'tool',
            toolUseId: 'tu_abc',
            toolName: 'pay_api',
            input: payApiInput(),
          },
        ],
        tools: [
          {
            toolUseId: 'tu_abc',
            toolName: 'pay_api',
            input: {},
          },
        ],
      },
    ];

    const out = findToolByToolUseId(messages, 'tu_abc');
    expect((out!.tool.input as { url: string }).url).toBe(PAY_API_URL);
  });

  it('regression: even with timeline missing entirely, root-fix recovery via tools[] works', () => {
    // Simulates the post-root-fix scenario where useEngine's
    // pendingInputsRef recovered the input into tools[] but
    // mergeWriteExecutionIntoTimeline somehow didn't fire (e.g.
    // timeline was undefined when resolveAction ran for some edge
    // case). The user can still regen because tools[].input is
    // now correct.
    const messages: FindToolMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        tools: [
          {
            toolUseId: 'tu_abc',
            toolName: 'pay_api',
            input: payApiInput(),
            result: { paid: true, cost: 0.05 },
          },
        ],
      },
    ];

    const out = findToolByToolUseId(messages, 'tu_abc');
    expect((out!.tool.input as { url: string }).url).toBe(PAY_API_URL);
  });

  it('regression: even with both timeline-tool-block AND tools[] missing, permission-card payload still works', () => {
    // The pathological worst case: every prior source failed. The
    // permission-card always exists for confirm-tier writes (added
    // by applyEventToTimeline.case "pending_action"), so this
    // last-resort source is always available.
    const messages: FindToolMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        timeline: [
          { type: 'text', text: 'I will generate the image now.' } as unknown as FindToolMessage['timeline'] extends (infer T)[] | undefined ? T : never,
          {
            type: 'permission-card',
            payload: {
              toolUseId: 'tu_abc',
              toolName: 'pay_api',
              input: payApiInput(),
            },
          },
        ],
        tools: [],
      },
    ];

    const out = findToolByToolUseId(messages, 'tu_abc');
    expect((out!.tool.input as { url: string }).url).toBe(PAY_API_URL);
  });
});
