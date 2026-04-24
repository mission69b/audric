'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { WordSpan } from '@/lib/voice/word-alignment';
import type { VoiceState } from '@/hooks/useVoiceMode';

/**
 * Shared voice-mode state so any component beneath the dashboard can
 * read which message is being spoken and which word is "current". Lives
 * in a context (rather than being prop-drilled) because the message
 * list, the input bar, and the ambient glow all need to react to the
 * same playback timeline simultaneously.
 *
 * `speakingMessageId` is non-null only while TTS is actively playing
 * for the latest assistant message. The MessageRenderer keys highlight
 * rendering off this id so we don't accidentally highlight historical
 * messages when a user later scrolls back.
 */

export interface VoiceModeContextValue {
  state: VoiceState;
  speakingMessageId: string | null;
  spokenWordIndex: number;
  currentSpans: WordSpan[] | null;
}

const VoiceModeContext = createContext<VoiceModeContextValue | null>(null);

export function VoiceModeProvider({
  value,
  children,
}: {
  value: VoiceModeContextValue;
  children: ReactNode;
}) {
  return (
    <VoiceModeContext.Provider value={value}>
      {children}
    </VoiceModeContext.Provider>
  );
}

export function useVoiceModeContext(): VoiceModeContextValue {
  const ctx = useContext(VoiceModeContext);
  return (
    ctx ?? {
      state: 'idle',
      speakingMessageId: null,
      spokenWordIndex: -1,
      currentSpans: null,
    }
  );
}
