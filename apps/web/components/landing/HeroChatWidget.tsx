// [PHASE 13] Marketing — hero chat widget for the landing page.
// Replaces the old `MockChatDemo` (rewritten to match the marketing handoff:
// 5-flow chip row, subtle typing indicator, and the in-line "tool call"
// preface bubble pattern from `audric-marketing/index.html`).
//
// Behavior preserved from the old widget:
//   • Click a chip → swap to that flow, restart the typed reveal
//   • Each message reveals at its own delay (so the convo "plays")
//   • Compose row is non-functional — clicking the input or send button
//     triggers `useZkLogin().login` to nudge the user into the real product

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useZkLogin } from '@/components/auth/useZkLogin';

interface DemoMessage {
  who: 'user' | 'bot';
  // `text` is rendered with `dangerouslySetInnerHTML` because the marketing
  // handoff inlines small `<b>`/`<br>` tags inside bot responses to mirror the
  // tool-call result formatting users see in the real app. All content is
  // hard-coded in this file — no user input flows through here.
  text: string;
  delay: number;
}

type FlowKey = 'balance' | 'send' | 'pay' | 'save' | 'swap';

interface FlowDef {
  key: FlowKey;
  label: string;
  messages: DemoMessage[];
}

const tool = (label: string) =>
  `<span class="font-mono text-[10px] uppercase tracking-[0.1em] text-success-fg">▸ ${label}</span><br/>`;

const FLOWS: FlowDef[] = [
  {
    key: 'balance',
    label: 'Check balance',
    messages: [
      { who: 'user', text: 'How much USDC do I have?', delay: 400 },
      {
        who: 'bot',
        text:
          tool('PORTFOLIO · FETCH BALANCE') +
          'You have <b>$244.18 USDC</b> — $200 earning <b>5.2% APY</b> on NAVI, $44.18 idle. Save the idle amount?',
        delay: 1200,
      },
      { who: 'user', text: 'And my SUI?', delay: 2600 },
      {
        who: 'bot',
        text: tool('WALLET · FETCH TOKEN') + '<b>12.4 SUI</b> (~$21.08). Part of your Passport. Want me to stake it?',
        delay: 3600,
      },
    ],
  },
  {
    key: 'send',
    label: 'Send USDC',
    messages: [
      { who: 'user', text: 'Send $20 USDC to alice', delay: 400 },
      {
        who: 'bot',
        text: tool('PAY · RESOLVE RECIPIENT') + 'Found <b>alice</b> → 0x9a2…b4f1. Confirm $20 USDC?',
        delay: 1200,
      },
      { who: 'user', text: 'Yes', delay: 2600 },
      {
        who: 'bot',
        text: tool('PAY · TRANSFER') + 'Sent. <b>Tx 0x4a…e9c2</b> · settled in 0.4s · fee $0.00.',
        delay: 3400,
      },
    ],
  },
  {
    key: 'pay',
    label: 'Payment link',
    messages: [
      { who: 'user', text: 'Generate a payment link for $5', delay: 400 },
      {
        who: 'bot',
        text:
          tool('PAY · CREATE LINK') +
          'Done — <b>audric.ai/pay/ghsAk6h4</b> · $5 USDC, no expiry. Share it anywhere.',
        delay: 1200,
      },
      { who: 'user', text: 'Also send as QR', delay: 2600 },
      {
        who: 'bot',
        text: tool('PAY · RENDER QR') + 'QR attached. Anyone can pay — no Audric account required.',
        delay: 3400,
      },
    ],
  },
  {
    key: 'save',
    label: 'Save idle',
    messages: [
      { who: 'user', text: 'Move the idle USDC into savings', delay: 400 },
      {
        who: 'bot',
        text:
          tool('FINANCE · QUOTE YIELD') +
          'Best route: <b>NAVI USDC</b> at <b>5.2% APY</b>, withdraw anytime. Deposit $44.18?',
        delay: 1200,
      },
      { who: 'user', text: 'Confirm', delay: 2600 },
      {
        who: 'bot',
        text:
          tool('FINANCE · DEPOSIT') +
          "Deposited. You're now earning on <b>$244.18</b> — est. <b>+$12.70/yr</b>.",
        delay: 3400,
      },
    ],
  },
  {
    key: 'swap',
    label: 'Swap',
    messages: [
      { who: 'user', text: 'Swap 1 USDC to SUI', delay: 400 },
      {
        who: 'bot',
        text:
          tool('SWAP · QUOTE') +
          'Best route via <b>Cetus</b>: <b>1 USDC → 0.588 SUI</b> · slippage 0.1% · fee $0.001. Confirm?',
        delay: 1200,
      },
      { who: 'user', text: 'Go', delay: 2600 },
      {
        who: 'bot',
        text: tool('SWAP · EXECUTE') + 'Done. <b>0.588 SUI</b> in your Passport. <b>Tx 0x8c…fa21</b>.',
        delay: 3400,
      },
    ],
  },
];

export function HeroChatWidget() {
  const { login } = useZkLogin();
  const [activeKey, setActiveKey] = useState<FlowKey>('balance');
  const [visible, setVisible] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const playFlow = useCallback((key: FlowKey) => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setVisible(0);
    setActiveKey(key);

    const flow = FLOWS.find((f) => f.key === key);
    if (!flow) return;
    flow.messages.forEach((msg, i) => {
      timersRef.current.push(setTimeout(() => setVisible(i + 1), msg.delay));
    });
  }, []);

  useEffect(() => {
    playFlow('balance');
    return () => timersRef.current.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll body to latest message as bubbles reveal.
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [visible, activeKey]);

  const flow = FLOWS.find((f) => f.key === activeKey);
  const messages = flow?.messages ?? [];
  const lastRevealed = messages.slice(0, visible);
  const stillTyping = visible < messages.length;

  return (
    <div className="w-full max-w-md rounded-md border border-border-subtle bg-surface-card overflow-hidden shadow-[0_1px_0_var(--surface-sunken),0_12px_40px_-20px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-success-solid" aria-hidden="true" />
          <span className="text-sm font-medium text-fg-primary">Audric</span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-fg-secondary">
          Online
        </span>
      </div>

      <div
        ref={bodyRef}
        className="px-4 py-5 h-[280px] sm:h-[320px] overflow-hidden flex flex-col gap-3"
      >
        {lastRevealed.map((msg, i) => (
          <div
            key={`${activeKey}-${i}`}
            className={
              msg.who === 'user'
                ? 'self-end max-w-[74%] px-3.5 py-2.5 text-[13px] leading-snug rounded-2xl rounded-br-sm bg-fg-primary text-fg-inverse animate-[fadeSlideIn_0.3s_ease-out_both]'
                : 'self-start max-w-[74%] px-3.5 py-2.5 text-[13px] leading-snug rounded-2xl rounded-bl-sm bg-surface-sunken text-fg-secondary animate-[fadeSlideIn_0.3s_ease-out_both]'
            }
            // The hard-coded marketing copy embeds `<b>` / `<br>` tags so the
            // bot bubbles can read like real tool-call results. No user data
            // ever flows into this innerHTML.
            dangerouslySetInnerHTML={{ __html: msg.text }}
          />
        ))}
        {stillTyping && (
          <div
            className="self-start inline-flex gap-1 px-3.5 py-2.5 bg-surface-sunken rounded-2xl rounded-bl-sm"
            aria-label="Audric is typing"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-fg-muted animate-bounce" style={{ animationDelay: '0s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-fg-muted animate-bounce" style={{ animationDelay: '0.15s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-fg-muted animate-bounce" style={{ animationDelay: '0.3s' }} />
          </div>
        )}
      </div>

      <div className="flex gap-1.5 px-4 py-3 border-t border-border-subtle overflow-x-auto scrollbar-none">
        {FLOWS.map((f) => {
          const active = f.key === activeKey;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => playFlow(f.key)}
              className={
                active
                  ? 'shrink-0 rounded-pill px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] uppercase bg-fg-primary text-fg-inverse border border-fg-primary cursor-pointer'
                  : 'shrink-0 rounded-pill px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] uppercase bg-surface-card text-fg-secondary border border-border-subtle cursor-pointer hover:text-fg-primary hover:border-border-strong transition'
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="text-center font-mono text-[10px] tracking-[0.08em] text-fg-muted px-4 py-1 uppercase">
        Sign in with Google to start
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border-subtle">
        <button
          type="button"
          onClick={login}
          className="flex-1 text-left text-[14px] text-fg-muted px-2 py-1.5 cursor-pointer hover:text-fg-secondary transition"
        >
          Ask anything about your money&hellip;
        </button>
        <button
          type="button"
          onClick={login}
          aria-label="Sign in to chat with Audric"
          className="w-8 h-8 rounded-md bg-fg-primary text-fg-inverse grid place-items-center cursor-pointer hover:opacity-80 transition"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
