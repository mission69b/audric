'use client';

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { VoiceState } from '@/hooks/useVoiceMode';

interface VoiceModeProps {
  /** Show the mic button at all (false when keys aren't configured server-side). */
  enabled: boolean;
  state: VoiceState;
  /** Tap mic → enter the continuous voice loop. */
  onStart: () => void;
  /** Tap Stop → exit voice mode entirely. */
  onStop: () => void;
  /** Live interim transcript (Whisper isn't streamed, so this is empty until done). */
  interimTranscript?: string;
  /** User-facing error to surface in the placeholder (e.g. "Microphone access denied"). */
  errorMessage?: string | null;
}

interface InputBarProps {
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  placeholder?: string;
  voiceMode?: VoiceModeProps;
}

/**
 * Translate the voice-mode state into the placeholder text shown inside
 * the textarea. Keeping this in one place makes it easy to tweak the
 * conversational copy without hunting through render branches.
 */
function voiceModePlaceholder(
  vm: VoiceModeProps | undefined,
  fallback: string,
): string {
  if (!vm || vm.state === 'idle') return fallback;
  if (vm.state === 'error' && vm.errorMessage) return vm.errorMessage;
  if (vm.state === 'thinking') return 'Thinking…';
  if (vm.state === 'speaking') return 'Audric is speaking…';
  if (vm.state === 'listening') {
    return vm.interimTranscript ? 'Listening…' : 'Listening…';
  }
  return fallback;
}

export function InputBar({
  onSubmit,
  onCancel,
  disabled,
  placeholder = 'Ask anything...',
  voiceMode,
}: InputBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (value.trim()) {
          setValue('');
        } else if (onCancel) {
          onCancel();
        }
      }
    },
    [handleSubmit, value, onCancel],
  );

  const hasContent = value.trim().length > 0;

  // Voice mode is "active" in any non-idle state. While active, the
  // textarea becomes a status display and the right-hand button morphs
  // from "Send" → "••• Stop" matching the Claude reference UI.
  const voiceActive =
    !!voiceMode &&
    voiceMode.enabled &&
    voiceMode.state !== 'idle' &&
    voiceMode.state !== 'error';

  const displayPlaceholder = voiceModePlaceholder(voiceMode, placeholder);

  return (
    <div
      className={[
        'flex flex-col rounded-lg border bg-surface-input p-4 transition-colors',
        voiceActive
          ? 'border-[var(--accent-blue,#3b82f6)] shadow-[0_0_0_3px_rgba(59,130,246,0.12)]'
          : 'border-border-subtle focus-within:border-border-strong',
      ].join(' ')}
    >
      <textarea
        ref={textareaRef}
        value={voiceActive ? '' : value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={displayPlaceholder}
        disabled={disabled || voiceActive}
        rows={1}
        aria-label="Message Audric"
        className={[
          'w-full resize-none bg-transparent text-[14px] font-sans text-fg-primary outline-none max-h-40 leading-[1.5] pb-3.5 disabled:opacity-100',
          voiceActive
            ? 'placeholder:text-fg-secondary placeholder:italic'
            : 'placeholder:text-fg-muted disabled:opacity-50',
        ].join(' ')}
      />

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 text-fg-muted hover:text-fg-secondary transition rounded focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          aria-label="Attach"
          onClick={() => textareaRef.current?.focus()}
          disabled={voiceActive}
        >
          <Icon name="plus" size={16} />
        </button>

        <div className="flex items-center gap-2">
          {voiceMode?.enabled && (
            <button
              type="button"
              onClick={() => {
                if (voiceActive) voiceMode.onStop();
                else void voiceMode.onStart();
              }}
              className={[
                'shrink-0 inline-flex items-center justify-center w-7 h-7 transition rounded focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
                voiceMode.state === 'listening'
                  ? 'text-[var(--accent-blue,#3b82f6)] animate-pulse'
                  : 'text-fg-muted hover:text-fg-secondary',
              ].join(' ')}
              aria-label={
                voiceActive ? 'Exit voice mode' : 'Start voice conversation'
              }
              aria-pressed={voiceActive}
              disabled={disabled}
            >
              <Icon name="microphone" size={16} />
            </button>
          )}

          {voiceActive ? (
            // Claude-style "••• Stop" pill: blue glow ring + animated dots
            // signal "I'm working on it, tap to interrupt." Matches the
            // reference screenshots the user shared.
            <button
              type="button"
              onClick={voiceMode!.onStop}
              className={[
                'shrink-0 inline-flex items-center gap-1.5 px-3 h-7 rounded-full',
                'bg-[var(--accent-blue,#3b82f6)] text-white text-[12px] font-medium',
                'shadow-[0_0_0_3px_rgba(59,130,246,0.25)] hover:opacity-90',
                'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
                'transition active:scale-[0.97]',
              ].join(' ')}
              aria-label="Stop voice mode"
            >
              <span className="flex items-center gap-0.5" aria-hidden>
                <span className="w-1 h-1 rounded-full bg-white animate-[voice-dot_1.2s_ease-in-out_infinite]" />
                <span className="w-1 h-1 rounded-full bg-white animate-[voice-dot_1.2s_ease-in-out_infinite] [animation-delay:0.2s]" />
                <span className="w-1 h-1 rounded-full bg-white animate-[voice-dot_1.2s_ease-in-out_infinite] [animation-delay:0.4s]" />
              </span>
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || !hasContent}
              className={[
                'shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
                hasContent
                  ? 'bg-fg-primary text-fg-inverse hover:opacity-80 active:scale-[0.95]'
                  : 'bg-border-subtle text-fg-muted cursor-default',
              ].join(' ')}
              aria-label="Send message"
            >
              <Icon name="arrow-up" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
