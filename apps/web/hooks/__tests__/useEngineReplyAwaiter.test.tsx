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
  it('resolves with the latest assistant text once kickoff finishes streaming', async () => {
    let messages: EngineChatMessage[] = [
      asMsg('user', 'hi', 'u1'),
      asMsg('assistant', '', 'a1'),
    ];

    const { result, rerender } = renderHook(
      ({ s, m }: { s: boolean; m: EngineChatMessage[] }) =>
        useEngineReplyAwaiter(s, m),
      { initialProps: { s: false, m: messages } },
    );

    // Simulate engine.sendMessage: flips isStreaming true, streams
    // content, flips isStreaming false. Each rerender is wrapped in
    // its own act() so React commits effects between them — without
    // that, RTL batches into the final state and the falling edge is
    // never observed.
    const kickoff = async () => {
      await act(async () => {
        rerender({ s: true, m: messages });
      });
      messages = [messages[0], asMsg('assistant', 'Hello there', 'a1')];
      await act(async () => {
        rerender({ s: true, m: messages });
      });
      await act(async () => {
        rerender({ s: false, m: messages });
      });
    };

    let resolved = '';
    // Outer act not needed — the awaiter Promise resolves inside the
    // last inner act(rerender). Directly await the result.
    resolved = await result.current(kickoff);

    expect(resolved).toBe('Hello there');
  });

  it('uses the LAST message in the array (not find-from-reverse with content)', async () => {
    // Two assistant messages: an older one with content, a newer empty one.
    // The new contract returns the *last* element if it's an assistant
    // message, even when empty — so we don't accidentally TTS-speak a
    // stale older reply.
    const initial: EngineChatMessage[] = [
      asMsg('assistant', 'OLD reply', 'a-old'),
      asMsg('user', 'follow up', 'u1'),
      asMsg('assistant', '', 'a-new'),
    ];

    const { result, rerender } = renderHook(
      ({ s, m }: { s: boolean; m: EngineChatMessage[] }) =>
        useEngineReplyAwaiter(s, m),
      { initialProps: { s: false, m: initial } },
    );

    const kickoff = async () => {
      await act(async () => {
        rerender({ s: true, m: initial });
      });
      await act(async () => {
        rerender({ s: false, m: initial });
      });
    };

    const resolved = await result.current(kickoff);
    expect(resolved).toBe('');
  });

  it('safety net resolves with empty when kickoff completes without any transition', async () => {
    // Engine no-op'd (e.g. guarded out): no isStreaming transitions
    // happen during kickoff. The safety net inside the hook must still
    // resolve so voice mode doesn't hang waiting forever.
    const messages: EngineChatMessage[] = [asMsg('user', 'hi', 'u1')];

    const { result } = renderHook(
      ({ s, m }: { s: boolean; m: EngineChatMessage[] }) =>
        useEngineReplyAwaiter(s, m),
      { initialProps: { s: false, m: messages } },
    );

    const kickoff = async () => {
      // Engine guard returns immediately, no state changes.
      return;
    };

    const resolved = await result.current(kickoff);
    expect(resolved).toBe('');
  });

  it('propagates kickoff errors and clears the pending resolver', async () => {
    const messages: EngineChatMessage[] = [asMsg('user', 'hi', 'u1')];

    const { result } = renderHook(
      ({ s, m }: { s: boolean; m: EngineChatMessage[] }) =>
        useEngineReplyAwaiter(s, m),
      { initialProps: { s: false, m: messages } },
    );

    const kickoff = async () => {
      throw new Error('boom');
    };

    await expect(result.current(kickoff)).rejects.toThrow('boom');
  });
});
