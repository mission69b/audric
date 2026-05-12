/**
 * [SPEC 23B-rehydration / 2026-05-12] Unit tests for the rehydration
 * synthesizer (`synthesizeTimelineFromMessage` + companion
 * `rehydrateTimelineForMessages`).
 *
 * The contract: take a flat persisted `EngineChatMessage` (the shape
 * returned by `/api/engine/sessions/[id]` after `convertSessionMessages`
 * collapses the engine ledger) and return a `TimelineBlock[]` that
 * faithfully restores rich-card rendering for the 80% case
 * (text + tools + canvas). Pure function — same input, same output.
 *
 * Coverage:
 *   - Empty / minimal messages return [] (caller falls back to plain text)
 *   - Text-only / thinking-only / mixed orderings
 *   - Tool blocks with `done` and `error` statuses
 *   - Canvas detection from `__canvas`-shaped tool results
 *   - Pass-through behavior in `rehydrateTimelineForMessages` (user
 *     messages unchanged, assistant messages with existing timeline
 *     unchanged, fresh assistant messages get synthesized)
 */
import { describe, it, expect } from 'vitest';
import {
  synthesizeTimelineFromMessage,
  rehydrateTimelineForMessages,
} from './timeline-builder';
import type {
  EngineChatMessage,
  ToolTimelineBlock,
  TextTimelineBlock,
  ThinkingTimelineBlock,
  CanvasTimelineBlock,
} from './engine-types';

function makeMessage(overrides: Partial<EngineChatMessage> = {}): EngineChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: 0,
    ...overrides,
  };
}

describe('synthesizeTimelineFromMessage — empty / minimal', () => {
  it('returns [] when message has no content / tools / thinking', () => {
    expect(synthesizeTimelineFromMessage(makeMessage())).toEqual([]);
  });

  it('returns [] when content is the empty string', () => {
    expect(
      synthesizeTimelineFromMessage(makeMessage({ content: '' })),
    ).toEqual([]);
  });

  it('returns [] when tools is an empty array', () => {
    expect(
      synthesizeTimelineFromMessage(makeMessage({ tools: [] })),
    ).toEqual([]);
  });
});

describe('synthesizeTimelineFromMessage — text + thinking', () => {
  it('emits one text block when content is set', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({ content: 'Hello, world.' }),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('text');
    expect((blocks[0] as TextTimelineBlock).text).toBe('Hello, world.');
    expect((blocks[0] as TextTimelineBlock).status).toBe('done');
  });

  it('emits one thinking block when message.thinking is set', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({ thinking: 'I should check the balance first.' }),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('thinking');
    expect((blocks[0] as ThinkingTimelineBlock).text).toBe(
      'I should check the balance first.',
    );
    expect((blocks[0] as ThinkingTimelineBlock).status).toBe('done');
    expect((blocks[0] as ThinkingTimelineBlock).blockIndex).toBe(0);
  });

  it('emits thinking BEFORE text when both are present', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        thinking: 'reasoning',
        content: 'response',
      }),
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('thinking');
    expect(blocks[1].type).toBe('text');
  });
});

describe('synthesizeTimelineFromMessage — tool blocks', () => {
  it('emits one tool block per tool execution (status: done)', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        tools: [
          {
            toolName: 'balance_check',
            toolUseId: 'tu_1',
            input: { address: '0xabc' },
            status: 'done',
            result: { wallet: 100, savings: 200 },
            isError: false,
          },
        ],
      }),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('tool');
    const tool = blocks[0] as ToolTimelineBlock;
    expect(tool.toolName).toBe('balance_check');
    expect(tool.toolUseId).toBe('tu_1');
    expect(tool.status).toBe('done');
    expect(tool.result).toEqual({ wallet: 100, savings: 200 });
    expect(tool.isError).toBe(false);
  });

  it('emits status: error when tool.status === error', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        tools: [
          {
            toolName: 'pay_api',
            toolUseId: 'tu_2',
            input: { url: 'elevenlabs/v1/text-to-speech' },
            status: 'error',
            result: { error: 'Service request failed' },
            isError: true,
          },
        ],
      }),
    );
    expect(blocks).toHaveLength(1);
    const tool = blocks[0] as ToolTimelineBlock;
    expect(tool.status).toBe('error');
    expect(tool.isError).toBe(true);
  });

  it('emits status: error when isError is true even if status is done', () => {
    // Defensive: persisted ledger could carry isError without status alignment
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        tools: [
          {
            toolName: 'pay_api',
            toolUseId: 'tu_3',
            input: {},
            status: 'done',
            result: { error: 'failed' },
            isError: true,
          },
        ],
      }),
    );
    const tool = blocks[0] as ToolTimelineBlock;
    expect(tool.status).toBe('error');
    expect(tool.isError).toBe(true);
  });

  it('emits multiple tool blocks in the same order as message.tools', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        tools: [
          { toolName: 'balance_check', toolUseId: 'tu_1', input: {}, status: 'done' },
          { toolName: 'savings_info', toolUseId: 'tu_2', input: {}, status: 'done' },
          { toolName: 'health_check', toolUseId: 'tu_3', input: {}, status: 'done' },
        ],
      }),
    );
    expect(blocks).toHaveLength(3);
    expect((blocks[0] as ToolTimelineBlock).toolName).toBe('balance_check');
    expect((blocks[1] as ToolTimelineBlock).toolName).toBe('savings_info');
    expect((blocks[2] as ToolTimelineBlock).toolName).toBe('health_check');
  });

  it('stamps startedAt + endedAt as 0 (not preserved across rehydration)', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        tools: [
          { toolName: 'balance_check', toolUseId: 'tu_1', input: {}, status: 'done' },
        ],
      }),
    );
    const tool = blocks[0] as ToolTimelineBlock;
    expect(tool.startedAt).toBe(0);
    expect(tool.endedAt).toBe(0);
  });
});

describe('synthesizeTimelineFromMessage — canvas detection', () => {
  it('emits a canvas block AFTER its source tool when result has __canvas signal', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        tools: [
          {
            toolName: 'render_canvas',
            toolUseId: 'tu_canvas',
            input: { template: 'full_portfolio' },
            status: 'done',
            result: {
              __canvas: true,
              template: 'full_portfolio',
              title: 'Full Portfolio Overview',
              templateData: { available: true, address: '0xabc' },
            },
          },
        ],
      }),
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('tool');
    expect(blocks[1].type).toBe('canvas');
    const canvas = blocks[1] as CanvasTimelineBlock;
    expect(canvas.template).toBe('full_portfolio');
    expect(canvas.title).toBe('Full Portfolio Overview');
    expect(canvas.toolUseId).toBe('tu_canvas');
    expect(canvas.data).toEqual({ available: true, address: '0xabc' });
  });

  it('does NOT emit a canvas block when result lacks the __canvas signal', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        tools: [
          {
            toolName: 'balance_check',
            toolUseId: 'tu_1',
            input: {},
            status: 'done',
            result: { wallet: 100 },
          },
        ],
      }),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('tool');
  });

  it('does NOT emit a canvas block when __canvas is true but template is missing', () => {
    // Defensive: malformed canvas results fall through to tool-only render
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        tools: [
          {
            toolName: 'render_canvas',
            toolUseId: 'tu_1',
            input: {},
            status: 'done',
            result: { __canvas: true, title: 'Broken' }, // no template
          },
        ],
      }),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('tool');
  });

  it('does NOT treat a string result as canvas-shaped', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        tools: [
          {
            toolName: 'render_canvas',
            toolUseId: 'tu_1',
            input: {},
            status: 'done',
            result: 'plain text result',
          },
        ],
      }),
    );
    expect(blocks).toHaveLength(1);
  });
});

describe('synthesizeTimelineFromMessage — full mixed turn', () => {
  it('emits thinking + text + tool + canvas in expected order for a render_canvas turn', () => {
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        thinking: 'User wants the portfolio canvas.',
        content: "Here's your portfolio.",
        tools: [
          {
            toolName: 'render_canvas',
            toolUseId: 'tu_canvas',
            input: { template: 'full_portfolio' },
            status: 'done',
            result: {
              __canvas: true,
              template: 'full_portfolio',
              title: 'Full Portfolio Overview',
              templateData: { available: true, address: '0xabc' },
            },
          },
        ],
      }),
    );
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe('thinking');
    expect(blocks[1].type).toBe('text');
    expect(blocks[2].type).toBe('tool');
    expect(blocks[3].type).toBe('canvas');
  });

  it('emits text + multiple tools (DALL-E + ElevenLabs) in original order', () => {
    // The B-MPP6 image-generation use case: rehydration of two
    // sequential pay_api calls (the founder's smoke probe 1 scenario).
    const blocks = synthesizeTimelineFromMessage(
      makeMessage({
        content: "Generated the sunrise image.",
        tools: [
          {
            toolName: 'pay_api',
            toolUseId: 'tu_dalle',
            input: { url: 'openai/v1/images/generations' },
            status: 'done',
            result: { serviceId: 'openai/v1/images/generations', price: 0.05 },
          },
        ],
      }),
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('text');
    expect(blocks[1].type).toBe('tool');
    expect((blocks[1] as ToolTimelineBlock).toolName).toBe('pay_api');
  });
});

describe('rehydrateTimelineForMessages — pass-through behavior', () => {
  it('leaves user messages unchanged', () => {
    const input: EngineChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hello', timestamp: 0 },
    ];
    const result = rehydrateTimelineForMessages(input);
    expect(result).toEqual(input);
    expect(result[0]).toBe(input[0]); // same reference, no clone
  });

  it('leaves assistant messages with existing timeline unchanged', () => {
    const existingTimeline: TextTimelineBlock[] = [
      { type: 'text', text: 'live-streamed', status: 'done' },
    ];
    const input: EngineChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'live-streamed',
        timestamp: 0,
        timeline: existingTimeline,
      },
    ];
    const result = rehydrateTimelineForMessages(input);
    expect(result[0].timeline).toBe(existingTimeline);
  });

  it('synthesizes timeline for assistant messages without one', () => {
    const input: EngineChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'rehydrated',
        timestamp: 0,
        tools: [
          { toolName: 'balance_check', toolUseId: 'tu_1', input: {}, status: 'done' },
        ],
      },
    ];
    const result = rehydrateTimelineForMessages(input);
    expect(result[0].timeline).toBeDefined();
    expect(result[0].timeline).toHaveLength(2); // text + tool
    expect(result[0].timeline?.[0].type).toBe('text');
    expect(result[0].timeline?.[1].type).toBe('tool');
  });

  it('leaves assistant messages without anything to synthesize unchanged (no empty timeline injected)', () => {
    const input: EngineChatMessage[] = [
      { id: 'a1', role: 'assistant', content: '', timestamp: 0 },
    ];
    const result = rehydrateTimelineForMessages(input);
    expect(result[0].timeline).toBeUndefined();
    expect(result[0]).toBe(input[0]);
  });

  it('preserves order across mixed user/assistant messages', () => {
    const input: EngineChatMessage[] = [
      { id: 'u1', role: 'user', content: 'request 1', timestamp: 0 },
      {
        id: 'a1',
        role: 'assistant',
        content: 'response 1',
        timestamp: 1,
      },
      { id: 'u2', role: 'user', content: 'request 2', timestamp: 2 },
      {
        id: 'a2',
        role: 'assistant',
        content: 'response 2',
        timestamp: 3,
        tools: [
          { toolName: 'balance_check', toolUseId: 'tu_1', input: {}, status: 'done' },
        ],
      },
    ];
    const result = rehydrateTimelineForMessages(input);
    expect(result).toHaveLength(4);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
    expect(result[1].timeline).toHaveLength(1); // text only
    expect(result[2].role).toBe('user');
    expect(result[3].role).toBe('assistant');
    expect(result[3].timeline).toHaveLength(2); // text + tool
  });
});
