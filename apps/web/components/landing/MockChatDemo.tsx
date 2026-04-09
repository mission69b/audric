'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useZkLogin } from '@/components/auth/useZkLogin';

interface DemoMessage {
  role: 'user' | 'assistant';
  text: string;
  delay: number;
}

const DEMOS: Record<string, DemoMessage[]> = {
  'Check balance': [
    { role: 'user', text: 'How much USDC do I have?', delay: 600 },
    { role: 'assistant', text: 'You have <strong>$244.18 USDC</strong> in your wallet — $200 earning <strong>5.2% APY</strong> in NAVI savings, and $44.18 idle. Want me to save the idle amount too?', delay: 1600 },
    { role: 'user', text: 'Save the idle USDC', delay: 3200 },
    { role: 'assistant', text: 'Depositing <strong>$44.18 USDC</strong> into NAVI savings at 5.2% APY.<br/><br/>At this rate you\'d earn about <strong>$0.006 more per day</strong>.', delay: 4400 },
  ],
  'Save USDC': [
    { role: 'user', text: 'Save $100 USDC', delay: 600 },
    { role: 'assistant', text: 'Depositing <strong>$100 USDC</strong> into NAVI savings at <strong>5.2% APY</strong>. That earns about <strong>$0.014/day</strong>.', delay: 1600 },
    { role: 'user', text: 'How much am I earning total now?', delay: 3200 },
    { role: 'assistant', text: 'Your total savings are now <strong>$300 USDC</strong> earning 5.2% APY — that\'s <strong>$0.043/day</strong> or about <strong>$15.60/year</strong>.', delay: 4400 },
  ],
  'Send money': [
    { role: 'user', text: 'Send $50 USDC to alice.sui', delay: 600 },
    { role: 'assistant', text: 'Sending <strong>$50 USDC</strong> to <strong>alice.sui</strong>. Transaction fee: <strong>$0.001</strong>. Confirm?', delay: 1600 },
    { role: 'user', text: 'Confirm', delay: 3000 },
    { role: 'assistant', text: 'Sent! <strong>$50 USDC → alice.sui</strong>. Transaction confirmed in 0.4s. Your remaining balance: <strong>$194.18 USDC</strong>.', delay: 4000 },
  ],
  'My APY': [
    { role: 'user', text: 'What\'s my current savings rate?', delay: 600 },
    { role: 'assistant', text: 'Your USDC is earning <strong>5.2% APY</strong> on NAVI Protocol. That\'s <strong>$0.028/day</strong> on your $200 savings.', delay: 1600 },
    { role: 'user', text: 'Is there a better rate?', delay: 3200 },
    { role: 'assistant', text: 'USDC on NAVI is the best right now at <strong>5.2%</strong>. suiUSDT is at 4.8%, USDY at 6.3% but requires a swap. Want me to move some into USDY?', delay: 4400 },
  ],
};

const CHIPS = Object.keys(DEMOS);

export function MockChatDemo() {
  const { login } = useZkLogin();
  const [activeDemo, setActiveDemo] = useState('Check balance');
  const [visible, setVisible] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const playDemo = useCallback((name: string) => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setVisible(0);
    setActiveDemo(name);

    const messages = DEMOS[name];
    if (!messages) return;
    messages.forEach((msg, i) => {
      timersRef.current.push(setTimeout(() => setVisible(i + 1), msg.delay));
    });
  }, []);

  useEffect(() => {
    playDemo('Check balance');
    return () => timersRef.current.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = DEMOS[activeDemo] ?? [];

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
        {messages.slice(0, visible).map((msg, i) => (
          <div
            key={`${activeDemo}-${i}`}
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
            onClick={() => playDemo(chip)}
            className={`shrink-0 font-mono text-[9px] px-2.5 py-1 border rounded-full transition cursor-pointer ${
              chip === activeDemo
                ? 'border-foreground text-foreground'
                : 'border-border text-muted hover:text-foreground hover:border-foreground'
            }`}
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
