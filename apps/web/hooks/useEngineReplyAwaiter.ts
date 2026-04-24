'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { EngineChatMessage } from '@/lib/engine-types';

/**
 * Bridge useEngine → Promise<reply text>. Voice mode needs to await the
 * assistant's full reply before kicking off TTS, but useEngine exposes
 * its state via React setState (not a Promise). This hook turns the
 * state-machine transition `isStreaming: true → false` into a one-shot
 * Promise that resolves with the most recent assistant message text.
 *
 * Usage:
 *   const awaitReply = useEngineReplyAwaiter(engine.isStreaming, engine.messages);
 *   ...
 *   await engine.sendMessage(userText);
 *   const reply = await awaitReply();  // resolves after isStreaming flips back to false
 *
 * Important: there must be exactly one in-flight awaitReply() at a time.
 * Voice mode's state machine guarantees this — we only call awaitReply()
 * after submitTranscript() and we don't accept user input during
 * `thinking`/`speaking` states.
 */

export function useEngineReplyAwaiter(
  isStreaming: boolean,
  messages: EngineChatMessage[],
) {
  const pendingRef = useRef<((text: string) => void) | null>(null);
  const wasStreamingRef = useRef<boolean>(isStreaming);
  const messagesRef = useRef<EngineChatMessage[]>(messages);
  messagesRef.current = messages;

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;

    // Falling edge of isStreaming: assistant has finished. Resolve the
    // pending awaiter (if any) with the latest assistant message text.
    if (wasStreaming && !isStreaming && pendingRef.current) {
      const resolver = pendingRef.current;
      pendingRef.current = null;
      const lastAssistant = [...messagesRef.current]
        .reverse()
        .find((m) => m.role === 'assistant' && m.content.length > 0);
      resolver(lastAssistant?.content ?? '');
    }
  }, [isStreaming]);

  return useCallback((): Promise<string> => {
    return new Promise<string>((resolve) => {
      // Replace any orphaned resolver so we don't leak. The voice state
      // machine shouldn't allow concurrent awaiters but this is cheap
      // defence-in-depth.
      pendingRef.current = resolve;
    });
  }, []);
}
