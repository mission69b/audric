'use client';

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ProductNav } from '@/components/layout/ProductNav';
import { useZkLogin } from '@/components/auth/useZkLogin';

type Message = { role: 'assistant' | 'user'; content: string; cta?: boolean };

const SCRIPTED_RESPONSES: { keywords: string[]; response: string }[] = [
  {
    keywords: ['save', 'yield', 'earn', 'apy', 'interest', 'deposit'],
    response:
      'Your USDC gets deposited into NAVI Protocol, currently earning 4.86% APY. It compounds automatically — no lock-ups, withdraw anytime.\n\nWant to try it? Just say "save $100" once you\'re signed in.',
  },
  {
    keywords: ['send', 'transfer', 'pay someone'],
    response:
      'I can send USDC to any Sui address in ~400ms. Zero fees beyond gas (which is sponsored). You can save contacts by name so next time you just say "send $50 to Alex."',
  },
  {
    keywords: ['pay', 'api', 'service', 'gateway', 'mpp'],
    response:
      'Audric Pay gives your AI access to 88+ API services — OpenAI, Anthropic, Brave Search, and more. Your agent pays per request with USDC. No API keys needed.',
  },
  {
    keywords: ['borrow', 'credit', 'loan', 'collateral'],
    response:
      'You can borrow USDC against your savings. No credit checks — your deposit is the collateral. 0.05% origination fee, repay anytime with no penalties. I monitor your health factor to keep you safe.',
  },
  {
    keywords: ['balance', 'how much', 'portfolio', 'account'],
    response: 'Sign in to see your real balance. I\'ll show you cash, savings, debt, yield, and assets — all in one view.',
  },
  {
    keywords: ['how', 'work', 'what is', 'explain', 'about'],
    response:
      'Three steps:\n\n1. Sign in with Google — no seed phrase, no extension\n2. Fund your wallet with USDC\n3. Talk to me — tell me what you need\n\nYour money lives in a non-custodial wallet on Sui. I build the transactions, but you approve every one.',
  },
  {
    keywords: ['receive', 'qr', 'address', 'fund'],
    response: 'Once you sign in, I\'ll give you a deposit address and QR code. You can fund from Binance, Coinbase, or any Sui wallet — just send USDC to your address.',
  },
  {
    keywords: ['safe', 'secure', 'trust', 'custod'],
    response:
      'Your wallet is non-custodial — only you control the keys (via zkLogin). I can\'t move funds without your approval. All transactions are on-chain and verifiable. Built on t2000 open-source infrastructure.',
  },
];

const SIGN_IN_PROMPT =
  'Ready to try for real? Sign in with Google — no seed phrase, no crypto jargon. It takes 10 seconds.';

const FALLBACK_RESPONSE =
  'I can help with saving, sending, borrowing, and paying for APIs — all in USDC on Sui. Try asking about one of those, or sign in to get started.';

const MAX_FREE_TURNS = 3;

const QUICK_ACTIONS = [
  { label: 'SAVE $100', text: 'How does saving work?' },
  { label: 'CHECK RATES', text: 'What rates can I earn?' },
  { label: 'SEND USDC', text: 'How do I send USDC?' },
  { label: 'HOW IT WORKS', text: 'How does Audric work?' },
];

function matchResponse(input: string): string {
  const lower = input.toLowerCase();
  for (const entry of SCRIPTED_RESPONSES) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.response;
    }
  }
  return FALLBACK_RESPONSE;
}

export default function LandingPage() {
  const router = useRouter();
  const { status, login } = useZkLogin();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Hi, I\'m Audric — your financial agent on Sui.\n\nI can help you save, pay, send, and borrow. All by conversation, all in USDC. Ask me anything.',
    },
  ]);
  const [turnCount, setTurnCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/new');
  }, [status, router]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, [messages, isTyping]);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => { resize(); }, [input, resize]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isTyping) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsTyping(true);

    const newTurn = turnCount + 1;
    setTurnCount(newTurn);

    setTimeout(() => {
      if (newTurn >= MAX_FREE_TURNS) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: SIGN_IN_PROMPT, cta: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: matchResponse(text) },
        ]);
      }
      setIsTyping(false);
    }, 600 + Math.random() * 400);
  }, [input, isTyping, turnCount]);

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
          {messages.map((msg, i) => (
            <div
              key={i}
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

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-surface text-foreground border border-border rounded-2xl rounded-bl-md px-4 py-3 text-sm">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-dim animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-dim animate-pulse [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-dim animate-pulse [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
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
              disabled={isTyping}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-dim outline-none max-h-[120px] leading-relaxed disabled:opacity-50"
            />

            <button
              onClick={handleSubmit}
              disabled={!hasContent || isTyping}
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
