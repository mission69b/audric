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
    <div className="flex items-center gap-3 rounded-[16px] border border-border bg-[var(--n800)] min-h-[52px] px-4 py-3 focus-within:border-foreground transition-colors">
      <button
        className="shrink-0 text-[18px] font-light text-[var(--n600)] leading-none hover:text-muted transition w-5 text-center"
        aria-label="Attach"
        onClick={() => textareaRef.current?.focus()}
      >
        +
      </button>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label="Message Audric"
        className="flex-1 resize-none bg-transparent text-[15px] font-sans text-foreground placeholder:text-[var(--n600)] outline-none max-h-40 leading-[1.5] disabled:opacity-50"
      />

      <button
        onClick={handleSubmit}
        disabled={disabled || !hasContent}
        className={[
          'shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center transition',
          hasContent
            ? 'bg-foreground text-background hover:opacity-80 active:scale-[0.95]'
            : 'bg-[var(--n400)] text-[var(--n700)] cursor-default',
        ].join(' ')}
        aria-label="Send message"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
