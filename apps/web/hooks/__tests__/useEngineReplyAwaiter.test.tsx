import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEngineReplyAwaiter } from '../useEngineReplyAwaiter';
import type { EngineChatMessage } from '@/lib/engine-types';

function asMsg(role: 'user' | 'assistant', content: string, id = 'm1'): EngineChatMessage {
  return {
    id,
    role,
    content,
    timestamp: Date.now(),
  };
}

describe('useEngineReplyAwaiter', () => {
  it('resolves with the latest assistant text once isStreaming flips false', async () => {
    const messages: EngineChatMessage[] = [
      asMsg('user', 'hi', 'u1'),
      asMsg('assistant', '', 'a1'),
    ];

    const { result, rerender } = renderHook(
      ({ isStreaming, msgs }) => useEngineReplyAwaiter(isStreaming, msgs),
      { initialProps: { isStreaming: true, msgs: messages } },
    );

    let resolved: string | undefined;
    act(() => {
      void result.current().then((text) => {
        resolved = text;
      });
    });

    // Streaming continues — promise should still be pending.
    rerender({
      isStreaming: true,
      msgs: [...messages.slice(0, 1), asMsg('assistant', 'Hello there', 'a1')],
    });

    expect(resolved).toBeUndefined();

    // Streaming ends — awaiter should resolve with the assistant content.
    await act(async () => {
      rerender({
        isStreaming: false,
        msgs: [...messages.slice(0, 1), asMsg('assistant', 'Hello there', 'a1')],
      });
      // Allow microtasks queued inside the effect to flush.
      await Promise.resolve();
    });

    expect(resolved).toBe('Hello there');
  });

  it('resolves with empty string when no assistant message has content', async () => {
    const { result, rerender } = renderHook(
      ({ isStreaming, msgs }) => useEngineReplyAwaiter(isStreaming, msgs),
      { initialProps: { isStreaming: true, msgs: [asMsg('user', 'hi', 'u1')] } },
    );

    let resolved: string | undefined;
    act(() => {
      void result.current().then((text) => {
        resolved = text;
      });
    });

    await act(async () => {
      rerender({ isStreaming: false, msgs: [asMsg('user', 'hi', 'u1')] });
      await Promise.resolve();
    });

    expect(resolved).toBe('');
  });

  it('does not resolve unless isStreaming has actually transitioned from true to false', async () => {
    const { result, rerender } = renderHook(
      ({ isStreaming, msgs }) => useEngineReplyAwaiter(isStreaming, msgs),
      { initialProps: { isStreaming: false, msgs: [] as EngineChatMessage[] } },
    );

    let resolved: string | undefined;
    act(() => {
      void result.current().then((text) => {
        resolved = text;
      });
    });

    // Re-render at the same false → false: no transition, no resolution.
    await act(async () => {
      rerender({ isStreaming: false, msgs: [] });
      await Promise.resolve();
    });

    expect(resolved).toBeUndefined();

    // Now actually transition true → false: should resolve.
    await act(async () => {
      rerender({ isStreaming: true, msgs: [] });
      await Promise.resolve();
    });
    await act(async () => {
      rerender({
        isStreaming: false,
        msgs: [asMsg('assistant', 'final', 'a1')],
      });
      await Promise.resolve();
    });

    expect(resolved).toBe('final');
  });
});
