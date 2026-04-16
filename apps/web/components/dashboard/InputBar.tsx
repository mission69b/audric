'use client';

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react';

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
    <div className="flex flex-col rounded-[16px] border border-border bg-surface px-4 pt-3 pb-2 focus-within:border-foreground transition-colors">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label="Message Audric"
        className="w-full resize-none bg-transparent text-[15px] font-sans text-foreground placeholder:text-dim outline-none max-h-40 leading-[1.5] disabled:opacity-50"
      />

      <div className="flex items-center justify-between mt-2">
        <button
          className="shrink-0 text-[18px] font-light text-dim leading-none hover:text-muted transition w-5 text-center focus-visible:ring-2 focus-visible:ring-foreground/20 rounded outline-none"
          aria-label="Attach"
          onClick={() => textareaRef.current?.focus()}
        >
          +
        </button>

        <div className="flex items-center gap-2">
          <button
            className="shrink-0 text-dim hover:text-muted transition focus-visible:ring-2 focus-visible:ring-foreground/20 rounded outline-none"
            aria-label="Voice input"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>

          <button
            onClick={handleSubmit}
            disabled={disabled || !hasContent}
            className={[
              'shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center transition',
              hasContent
                ? 'bg-foreground text-background hover:opacity-80 active:scale-[0.95]'
                : 'bg-[var(--n700)] text-[var(--n500)] cursor-default',
            ].join(' ')}
            aria-label="Send message"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
