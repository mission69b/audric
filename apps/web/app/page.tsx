'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useZkLogin } from '@/components/auth/useZkLogin';

const DEMO_MESSAGES: { role: 'assistant' | 'user'; content: React.ReactNode }[] = [
  {
    role: 'assistant',
    content: (
      <>
        Hi, I&apos;m Audric — your financial agent on Sui.
        <br /><br />
        I can help you save, pay, send, and borrow. All by conversation, all in USDC.
      </>
    ),
  },
  {
    role: 'assistant',
    content: (
      <>
        Here&apos;s what I can do:
        <br /><br />
        • <strong>Save</strong> — Earn 4.86% APY on USDC
        <br />
        • <strong>Pay</strong> — Access 88+ APIs with micropayments
        <br />
        • <strong>Send</strong> — Transfer USDC anywhere, instantly
        <br />
        • <strong>Credit</strong> — Borrow against your savings
      </>
    ),
  },
  {
    role: 'user',
    content: 'Save $100',
  },
  {
    role: 'assistant',
    content: (
      <>
        Here&apos;s what would happen:
        <br /><br />
        Your <strong>$100 USDC</strong> gets deposited into NAVI Protocol, currently earning{' '}
        <strong>4.86% APY</strong>. That&apos;s ~$4.86/year, compounding automatically.
        <br /><br />
        Connect your wallet to start earning.
      </>
    ),
  },
  {
    role: 'user',
    content: 'How does Audric work?',
  },
  {
    role: 'assistant',
    content: (
      <>
        Audric is a financial operating system built on Sui.
        <br /><br />
        <strong>Three steps:</strong>
        <br />
        1. <strong>Sign in</strong> with Google (no seed phrases)
        <br />
        2. <strong>Fund</strong> your wallet with USDC
        <br />
        3. <strong>Talk</strong> — tell me what you need
        <br /><br />
        Your money lives in a non-custodial wallet. I execute transactions, but you approve every one.
        Built on t2000 infrastructure.
      </>
    ),
  },
];

const QUICK_ACTIONS = ['SAVE $100', 'CHECK RATES', 'SEND USDC', 'HOW IT WORKS'];

const NAV_LINKS = [
  { label: 'Savings', href: '/savings' },
  { label: 'Pay', href: '/pay' },
  { label: 'Send', href: '/send' },
  { label: 'Credit', href: '/credit' },
];

export default function LandingPage() {
  const router = useRouter();
  const { status, login } = useZkLogin();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/new');
    }
  }, [status, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  const handleAction = () => {
    login();
  };

  return (
    <div className="flex flex-col h-full min-h-dvh">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
        <Link href="/" className="font-mono font-semibold text-foreground tracking-tight text-sm uppercase">
          Audric
        </Link>

        <div className="hidden sm:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted hover:text-foreground transition"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <button
          onClick={handleAction}
          className="bg-foreground text-background rounded-lg px-4 py-2 text-xs font-mono uppercase font-medium hover:opacity-80 active:scale-[0.98] transition"
        >
          Sign in
        </button>
      </nav>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-none"
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          {DEMO_MESSAGES.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={[
                  'max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'assistant'
                    ? 'bg-surface text-foreground'
                    : 'bg-foreground text-background',
                ].join(' ')}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 border-t border-border bg-background safe-bottom">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 space-y-3">
          {/* Quick action chips */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                onClick={handleAction}
                className="border border-border rounded-full px-4 py-2 text-xs font-mono uppercase text-muted hover:text-foreground hover:border-foreground transition whitespace-nowrap shrink-0"
              >
                {action}
              </button>
            ))}
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleAction}
              className="flex-1 text-left bg-surface rounded-lg px-4 py-3 text-sm text-dim cursor-pointer hover:bg-surface/80 transition"
            >
              Ask Audric anything...
            </button>
            <button
              onClick={handleAction}
              className="bg-foreground text-background rounded-lg p-3 hover:opacity-80 active:scale-[0.98] transition shrink-0"
              aria-label="Send"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-background"
              >
                <path
                  d="M2.5 8H13.5M13.5 8L8.5 3M13.5 8L8.5 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
