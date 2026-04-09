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
  'Send money': [
    { role: 'user', text: 'Send $50 USDC to 0x7f20...f6dc', delay: 600 },
    { role: 'assistant', text: 'Sending <strong>$50 USDC</strong> to <strong>0x7f20...f6dc</strong>. Confirm?', delay: 1600 },
    { role: 'user', text: 'Yes', delay: 3000 },
    { role: 'assistant', text: 'Sent! Confirmed in 0.4s.<br/><br/>Save this address as a contact? e.g. <strong>"Alice"</strong>', delay: 4000 },
  ],
  'Savings goal': [
    { role: 'user', text: 'Create a goal to save $1,000 by December', delay: 600 },
    { role: 'assistant', text: 'Created your savings goal: <strong>$1,000 by Dec 2026</strong>. You currently have <strong>$244</strong> saved — that\'s 24.4% progress. You\'d need about <strong>$94/month</strong> to hit it.', delay: 1800 },
    { role: 'user', text: 'Save $94 now', delay: 3400 },
    { role: 'assistant', text: 'Depositing <strong>$94 USDC</strong> into savings at 5.2% APY. Goal progress: <strong>33.8%</strong>. On track for December.', delay: 4600 },
  ],
  'Send postcard': [
    { role: 'user', text: 'Send a postcard to my mum for her birthday', delay: 600 },
    { role: 'assistant', text: 'I\'ll create a birthday postcard for your mum. Generating design + personal message via <strong>Audric Pay</strong>...<br/><br/>🎨 <em>Watercolour flowers with "Happy Birthday Mum"</em><br/><br/>Print &amp; mail: <strong>$1.05</strong>. Send it?', delay: 1800 },
    { role: 'user', text: 'Send it', delay: 3600 },
    { role: 'assistant', text: 'Done! Postcard on its way. Paid <strong>$1.05</strong> from your budget. Delivery in 3–5 days. 💌', delay: 4800 },
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
    <div
      className="w-full max-w-md border rounded-xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
      style={{
        '--demo-bg': '#FFFFFF',
        '--demo-surface': '#F7F7F7',
        '--demo-border': '#E5E5E5',
        '--demo-fg': '#191919',
        '--demo-muted': '#707070',
        '--demo-dim': '#9F9F9F',
        background: 'var(--demo-bg)',
        color: 'var(--demo-fg)',
        borderColor: 'var(--demo-border)',
      } as React.CSSProperties}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--demo-border)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        <span className="text-xs font-medium" style={{ color: 'var(--demo-fg)' }}>Audric</span>
        <span className="ml-auto font-mono text-[9px]" style={{ color: 'var(--demo-dim)' }}>Online</span>
      </div>

      {/* Messages */}
      <div className="h-[300px] sm:h-[320px] overflow-hidden px-4 py-4 flex flex-col gap-2.5">
        {messages.slice(0, visible).map((msg, i) => (
          <div
            key={`${activeDemo}-${i}`}
            className="max-w-[85%] px-3.5 py-2.5 text-[12px] leading-[1.5] animate-[fadeSlideIn_0.3s_ease-out_both]"
            style={
              msg.role === 'user'
                ? { alignSelf: 'flex-end', background: 'var(--demo-fg)', color: 'var(--demo-bg)', borderRadius: '1rem 1rem 0.25rem 1rem' }
                : { alignSelf: 'flex-start', background: 'var(--demo-surface)', color: 'var(--demo-fg)', borderRadius: '1rem 1rem 1rem 0.25rem' }
            }
            dangerouslySetInnerHTML={{ __html: msg.text }}
          />
        ))}
      </div>

      {/* Chips */}
      <div className="px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-none" style={{ borderTop: '1px solid var(--demo-border)' }}>
        {CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => playDemo(chip)}
            className="shrink-0 font-mono text-[10px] px-2.5 py-1 border rounded-full transition cursor-pointer"
            style={{
              borderColor: chip === activeDemo ? 'var(--demo-fg)' : 'var(--demo-border)',
              color: chip === activeDemo ? 'var(--demo-fg)' : 'var(--demo-muted)',
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Sign-in badge */}
      <div className="px-4 py-1.5 text-center" style={{ background: 'var(--demo-surface)', borderTop: '1px solid var(--demo-border)' }}>
        <span className="font-mono text-[9px]" style={{ color: 'var(--demo-dim)' }}>Sign in with Google to start</span>
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: '1px solid var(--demo-border)' }}>
        <button
          onClick={login}
          className="flex-1 text-left rounded-lg px-3 py-2 text-[12px] cursor-pointer transition"
          style={{ background: 'var(--demo-surface)', border: '1px solid var(--demo-border)', color: 'var(--demo-dim)' }}
        >
          Ask anything about your money...
        </button>
        <button
          onClick={login}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer hover:opacity-80 transition"
          style={{ background: 'var(--demo-fg)', color: 'var(--demo-bg)' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
