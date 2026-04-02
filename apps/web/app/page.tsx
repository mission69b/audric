'use client';

import { Suspense, useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductNav } from '@/components/layout/ProductNav';
import { ThinkingState } from '@/components/engine/ThinkingState';
import { ChatDivider } from '@/components/engine/ChatDivider';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { useDemoChat } from '@/hooks/useDemoChat';

const MAX_FREE_TURNS = 5;

const SIGN_IN_PROMPT =
  'Ready to try for real? Sign in with Google — no seed phrase, no crypto jargon. It takes 10 seconds.';

type Category = 'savings' | 'payments' | 'send' | 'credit' | 'apis';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'savings', label: 'Savings' },
  { id: 'payments', label: 'Payments' },
  { id: 'send', label: 'Send' },
  { id: 'credit', label: 'Credit' },
  { id: 'apis', label: 'APIs' },
];

const CATEGORY_PROMPTS: Record<Category, string[]> = {
  savings: [
    'Save $100 in USDC',
    "What's my current yield?",
    'Withdraw all savings',
  ],
  payments: [
    'Pay for a web search',
    'How much does an API call cost?',
    'Search for flights to Tokyo',
  ],
  send: [
    'Send $50 to Alex',
    'Send USDC to 0x1a2b...',
    'Who did I send to last?',
  ],
  credit: [
    'Borrow $500 against my savings',
    "What's my health factor?",
    'Repay all my debt',
  ],
  apis: [
    'What APIs can I use?',
    'Search the web for Bitcoin price',
    'Generate an image of a sunset',
  ],
};

const CHAT_QUICK_ACTIONS = [
  { label: 'SAVE $100', text: 'Save $100' },
  { label: 'BORROW', text: 'Borrow USDC against my savings' },
  { label: 'SEND USDC', text: 'Send $50 to a friend' },
  { label: 'PAY FOR API', text: 'Pay for an API call' },
];

export default function LandingPage() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  );
}

function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, login } = useZkLogin();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptParam = searchParams.get('prompt');

  const [input, setInput] = useState(promptParam ?? '');
  const [turnCount, setTurnCount] = useState(0);
  const [mode, setMode] = useState<'hero' | 'chat'>('hero');
  const [activeCategory, setActiveCategory] = useState<Category>('savings');
  const promptHandled = useRef(false);

  const { messages, isStreaming, sendMessage, cancel, addCtaMessage } = useDemoChat();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/new');
  }, [status, router]);

  useEffect(() => {
    if (promptParam && !promptHandled.current) {
      promptHandled.current = true;
      setInput(promptParam);
      textareaRef.current?.focus();
    }
  }, [promptParam]);

  useEffect(() => {
    if (mode === 'chat') {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages, isStreaming, mode]);

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

    if (mode === 'hero') {
      setMode('chat');
    }

    const newTurn = turnCount + 1;
    setTurnCount(newTurn);

    if (newTurn > MAX_FREE_TURNS) {
      addCtaMessage(SIGN_IN_PROMPT);
      return;
    }

    sendMessage(text);
  }, [input, isStreaming, turnCount, mode, sendMessage, addCtaMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handlePromptClick = useCallback(
    (prompt: string) => {
      setInput(prompt);
      textareaRef.current?.focus();
    },
    [],
  );

  const hasContent = input.trim().length > 0;

  const inputBar = (
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
        placeholder={turnCount > 0 ? 'Ask a follow up...' : 'Ask anything...'}
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
  );

  if (mode === 'hero') {
    return (
      <div className="flex flex-col h-full min-h-dvh">
        <ProductNav />

        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 -mt-16">
          <h1 className="font-mono text-4xl sm:text-5xl font-semibold tracking-tight text-foreground uppercase mb-8">
            Audric
          </h1>

          <div className="w-full max-w-xl mb-6">
            {inputBar}
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={[
                  'rounded-full px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition',
                  activeCategory === cat.id
                    ? 'bg-foreground text-background'
                    : 'border border-border text-muted hover:text-foreground hover:border-foreground',
                ].join(' ')}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center gap-2 max-w-xl">
            {CATEGORY_PROMPTS[activeCategory].map((prompt) => (
              <button
                key={prompt}
                onClick={() => handlePromptClick(prompt)}
                className="text-sm text-muted hover:text-foreground transition cursor-pointer group"
              >
                <span className="text-dim group-hover:text-muted mr-1.5">&rarr;</span>
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-dvh">
      <ProductNav />

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-3">
          <ChatDivider label="TASK INITIATED" />

          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-surface border border-border px-4 py-2.5 text-sm text-foreground break-words">
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="space-y-2">
                {msg.isStreaming && !msg.content && (
                  <div className="pl-1">
                    <ThinkingState status="thinking" intensity="active" />
                  </div>
                )}
                {msg.content && (
                  <div className="pl-1 text-sm">
                    <span className="text-dim font-mono text-[11px] mr-1.5 float-left leading-relaxed uppercase tracking-wider" aria-hidden="true">au</span>
                    <span className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                      {msg.isStreaming && (
                        <span className="inline-flex items-center ml-1.5 align-text-bottom">
                          <ThinkingState status="delivering" intensity="transitioning" />
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {msg.cta && (
                  <div className="pl-1">
                    <button
                      onClick={login}
                      className="w-full bg-foreground text-background rounded-lg px-4 py-3 text-xs font-mono uppercase tracking-wider font-medium hover:opacity-80 active:scale-[0.98] transition"
                    >
                      Sign in with Google
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background safe-bottom">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 space-y-3">
          {!isStreaming && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {CHAT_QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handlePromptClick(action.text)}
                  className="border border-border rounded-full px-4 py-2 text-xs font-mono uppercase tracking-wider text-muted hover:text-foreground hover:border-foreground transition whitespace-nowrap shrink-0"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {inputBar}

          {isStreaming && (
            <div className="flex justify-center">
              <button
                onClick={cancel}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-mono uppercase tracking-wider text-muted hover:text-foreground hover:border-foreground transition active:scale-[0.97]"
              >
                <span className="text-base leading-none">&#9632;</span> Stop
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
