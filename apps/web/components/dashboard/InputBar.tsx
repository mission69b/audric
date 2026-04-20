'use client';

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react';
import { Icon } from '@/components/ui/Icon';

interface InputBarProps {
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({
  onSubmit,
  onCancel,
  disabled,
  placeholder = 'Ask anything...',
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

  return (
    <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-input p-4 focus-within:border-border-strong transition-colors">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label="Message Audric"
        className="w-full resize-none bg-transparent text-[14px] font-sans text-fg-primary placeholder:text-fg-muted outline-none max-h-40 leading-[1.5] pb-3.5 disabled:opacity-50"
      />

      {/* Tooltips intentionally omitted — buttons are self-evident with their
          icons + aria-label, and the dark prototype's composer
          (audric-app-dark/dashboard.jsx lines 64–68) is bare-button-only. */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 text-fg-muted hover:text-fg-secondary transition rounded focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          aria-label="Attach"
          onClick={() => textareaRef.current?.focus()}
        >
          <Icon name="plus" size={16} />
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 text-fg-muted hover:text-fg-secondary transition rounded focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            aria-label="Voice input"
          >
            <Icon name="microphone" size={16} />
          </button>

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
        </div>
      </div>
    </div>
  );
}
