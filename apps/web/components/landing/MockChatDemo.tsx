'use client';

import { useEffect, useState } from 'react';
import { useZkLogin } from '@/components/auth/useZkLogin';

interface DemoMessage {
  role: 'user' | 'assistant';
  text: string;
  delay: number;
}

const DEMO_MESSAGES: DemoMessage[] = [
  {
    role: 'user',
    text: 'How much USDC do I have?',
    delay: 800,
  },
  {
    role: 'assistant',
    text: 'You have <strong>$244.18 USDC</strong> in your wallet — $200 earning <strong>5.2% APY</strong> in NAVI savings, and $44.18 idle. Want me to save the idle amount too?',
    delay: 1800,
  },
  {
    role: 'user',
    text: 'Save the idle USDC',
    delay: 3500,
  },
  {
    role: 'assistant',
    text: 'Depositing <strong>$44.18 USDC</strong> into NAVI savings at 5.2% APY.<br/><br/>At this rate you\'d earn about <strong>$0.006 more per day</strong>.',
    delay: 4800,
  },
];

const CHIPS = ['Check balance', 'Save USDC', 'Send money', 'My APY'];

export function MockChatDemo() {
  const { login } = useZkLogin();
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    DEMO_MESSAGES.forEach((msg, i) => {
      timers.push(setTimeout(() => setVisible(i + 1), msg.delay));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="w-full max-w-md border border-border rounded-xl overflow-hidden bg-background shadow-[0_8px_40px_rgba(0,0,0,0.08)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        <span className="text-xs font-medium text-foreground">Audric</span>
        <span className="ml-auto font-mono text-[9px] text-dim">5 free turns</span>
      </div>

      {/* Messages */}
      <div className="h-[300px] sm:h-[320px] overflow-hidden px-4 py-4 flex flex-col gap-2.5">
        {DEMO_MESSAGES.slice(0, visible).map((msg, i) => (
          <div
            key={i}
            className={`max-w-[85%] px-3.5 py-2.5 text-[12px] leading-[1.5] animate-[fadeSlideIn_0.3s_ease-out_both] ${
              msg.role === 'user'
                ? 'self-end bg-foreground text-background rounded-2xl rounded-br-sm'
                : 'self-start bg-surface text-foreground rounded-2xl rounded-bl-sm'
            }`}
            dangerouslySetInnerHTML={{ __html: msg.text }}
          />
        ))}
      </div>

      {/* Chips */}
      <div className="px-4 py-2 border-t border-border flex gap-1.5 overflow-x-auto scrollbar-none">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={login}
            className="shrink-0 font-mono text-[9px] px-2.5 py-1 border border-border rounded-full text-muted hover:text-foreground hover:border-foreground transition cursor-pointer"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Sign-in badge */}
      <div className="px-4 py-1.5 text-center bg-surface border-t border-border">
        <span className="font-mono text-[9px] text-dim">5 free turns · Sign in with Google to continue</span>
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border">
        <button
          onClick={login}
          className="flex-1 text-left bg-surface border border-border rounded-lg px-3 py-2 text-[12px] text-dim cursor-pointer hover:border-foreground transition"
        >
          Ask anything about your money...
        </button>
        <button
          onClick={login}
          className="shrink-0 w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center cursor-pointer hover:opacity-80 transition"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
