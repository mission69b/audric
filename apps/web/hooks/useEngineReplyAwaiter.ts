'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { EngineChatMessage } from '@/lib/engine-types';

/**
 * Bridge useEngine → Promise<reply text>. Voice mode needs to await the
 * assistant's full reply before kicking off TTS, but useEngine exposes
 * its state via React setState (not a Promise). This hook turns the
 * state-machine transition `isStreaming: true → false` into a Promise
 * that resolves with the most recent assistant message text.
 *
 * Usage:
 *   const awaitReply = useEngineReplyAwaiter(engine.isStreaming, engine.messages);
 *   ...
 *   const reply = await awaitReply(() => engine.sendMessage(userText));
 *
 * Why does this take a `kickoff` callback? `engine.sendMessage` itself
 * `await`s the entire SSE stream, so by the time it resolves the
 * `true → false` transition has already happened. If we set the
 * pending resolver only after `sendMessage` returns, we'd miss the
 * edge entirely and hang forever. Doing it as
 *   1) snapshot the previous turn id
 *   2) install pending resolver
 *   3) kick off sendMessage (which both flips isStreaming and awaits it)
 *   4) the falling-edge effect resolves the resolver
 * guarantees the resolver is registered before any state transition
 * the kickoff might trigger.
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
      // Use the *last* message in the array, not the last one with
      // non-empty content. The engine's sendMessage flow always
      // appends [user, assistant-placeholder]; after streaming the
      // placeholder is the final element. Falling back to an older
      // assistant message would TTS-speak stale content.
      const lastMsg = messagesRef.current[messagesRef.current.length - 1];
      const text =
        lastMsg && lastMsg.role === 'assistant' ? lastMsg.content : '';
      resolver(text);
    }
  }, [isStreaming]);

  return useCallback(
    async (kickoff: () => Promise<void>): Promise<string> => {
      const promise = new Promise<string>((resolve) => {
        // Replace any orphaned resolver so we don't leak. The voice
        // state machine shouldn't allow concurrent awaiters but this is
        // cheap defence-in-depth.
        pendingRef.current = resolve;
      });

      try {
        await kickoff();
      } catch (err) {
        // The kickoff blew up before any stream started (e.g. auth
        // missing). Resolve with empty string so voice mode can
        // gracefully fall through to "no reply → resume listening".
        const resolver = pendingRef.current;
        pendingRef.current = null;
        if (resolver) resolver('');
        throw err;
      }

      // Safety net: if `kickoff` resolved but no isStreaming transition
      // ever fired (e.g. engine no-op'd because of a guard), resolve
      // with whatever the latest assistant message currently holds so
      // we don't hang.
      if (pendingRef.current) {
        const resolver = pendingRef.current;
        pendingRef.current = null;
        const lastMsg = messagesRef.current[messagesRef.current.length - 1];
        const text =
          lastMsg && lastMsg.role === 'assistant' ? lastMsg.content : '';
        resolver(text);
      }

      return promise;
    },
    [],
  );
}
