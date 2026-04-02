'use client';

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ProductNav } from '@/components/layout/ProductNav';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { useDemoChat } from '@/hooks/useDemoChat';

const MAX_FREE_TURNS = 5;

const SIGN_IN_PROMPT =
  'Ready to try for real? Sign in with Google — no seed phrase, no crypto jargon. It takes 10 seconds.';

const QUICK_ACTIONS = [
  { label: 'SAVE $100', text: 'Save $100' },
  { label: 'BORROW', text: 'Borrow USDC against my savings' },
  { label: 'PAY FOR API', text: 'Pay for an API call' },
  { label: 'SEND USDC', text: 'Send $50 to a friend' },
  { label: 'HOW IT WORKS', text: 'What is Audric?' },
];

export default function LandingPage() {
  const router = useRouter();
  const { status, login } = useZkLogin();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [turnCount, setTurnCount] = useState(0);

  const greeting =
    "Hi, I'm Audric — your financial agent on Sui. I can help you save, pay, send, and borrow. All by conversation, all in USDC. Ask me anything.";

  const { messages, isStreaming, sendMessage, addCtaMessage } = useDemoChat(greeting);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/new');
  }, [status, router]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, [messages, isStreaming]);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => { resize(); }, [input, resize]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');

    const newTurn = turnCount + 1;
    setTurnCount(newTurn);

    if (newTurn > MAX_FREE_TURNS) {
      addCtaMessage(SIGN_IN_PROMPT);
      return;
    }

    sendMessage(text);
  }, [input, isStreaming, turnCount, sendMessage, addCtaMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChipClick = useCallback(
    (text: string) => {
      setInput(text);
      textareaRef.current?.focus();
    },
    [],
  );

  const hasContent = input.trim().length > 0;

  return (
    <div className="flex flex-col h-full min-h-dvh">
      <ProductNav />

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={[
                  'max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
                  msg.role === 'assistant'
                    ? 'bg-surface text-foreground border border-border rounded-bl-md'
                    : 'bg-surface text-foreground border border-border rounded-br-md',
                ].join(' ')}
              >
                {msg.content}
                {msg.isStreaming && !msg.content && (
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-dim animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-dim animate-pulse [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-dim animate-pulse [animation-delay:300ms]" />
                  </span>
                )}
                {msg.isStreaming && msg.content && (
                  <span
                    className="inline-block w-1.5 h-4 bg-foreground/40 animate-pulse ml-0.5 align-text-bottom"
                    aria-hidden="true"
                  />
                )}
                {msg.cta && (
                  <button
                    onClick={login}
                    className="mt-3 w-full bg-foreground text-background rounded-lg px-4 py-3 text-xs font-mono uppercase tracking-wider font-medium hover:opacity-80 active:scale-[0.98] transition"
                  >
                    Sign in with Google
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background safe-bottom">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 space-y-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => handleChipClick(action.text)}
                className="border border-border rounded-full px-4 py-2 text-xs font-mono uppercase tracking-wider text-muted hover:text-foreground hover:border-foreground transition whitespace-nowrap shrink-0"
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-2 focus-within:border-foreground transition-colors">
            <button
              className="shrink-0 p-2 text-dim hover:text-muted transition"
              aria-label="Attach"
              onClick={() => textareaRef.current?.focus()}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-dim outline-none max-h-[120px] leading-relaxed disabled:opacity-50"
            />

            <button
              onClick={handleSubmit}
              disabled={!hasContent || isStreaming}
              className={[
                'shrink-0 rounded-full p-2 transition',
                hasContent
                  ? 'bg-foreground text-background hover:opacity-80 active:scale-[0.95]'
                  : 'bg-transparent text-dim cursor-default',
              ].join(' ')}
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
