// [PHASE 13] Marketing — "Your passport to a new kind of finance." section.
// 4-up bordered grid + centered CTA below.
//
// CTA preserved: invokes `useZkLogin().login` (was the same in the old monolith).

'use client';

import type { ReactNode } from 'react';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { BorderedGrid } from './BorderedGrid';

interface Pillar {
  title: string;
  body: string;
  glyph: ReactNode;
}

const PILLARS: Pillar[] = [
  {
    title: 'Identity',
    body:
      'Sign in with Google. Your Passport is a cryptographic wallet, created in 3 seconds. No seed phrase. Yours forever.',
    glyph: (
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <rect x="3" y="6" width="24" height="18" rx="2" className="fill-fg-primary" />
        <rect x="7" y="10" width="7" height="7" rx="3.5" className="fill-surface-card" />
        <rect x="16" y="11" width="8" height="1.2" className="fill-surface-card" />
        <rect x="16" y="14" width="6" height="1.2" className="fill-surface-card" />
        <rect x="7" y="19" width="16" height="1.2" className="fill-surface-card" />
      </svg>
    ),
  },
  {
    title: 'You decide',
    body:
      'Audric never moves money on its own. Every save, send, swap, and borrow waits on your tap-to-confirm.',
    glyph: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-fg-primary"
        aria-hidden="true"
      >
        <path d="M6 15l4 4 10-10" />
        <circle cx="15" cy="15" r="12" />
      </svg>
    ),
  },
  {
    title: 'Sponsored gas',
    body:
      "We pay the network fees so you don't need SUI to transact. Your USDC stays your USDC.",
    glyph: (
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <rect x="6" y="13" width="18" height="13" rx="1.5" className="fill-fg-primary" />
        <path
          d="M10 13v-3a5 5 0 0 1 10 0v3"
          strokeWidth="1.8"
          fill="none"
          className="stroke-fg-primary"
        />
        <circle cx="15" cy="19" r="1.8" className="fill-surface-card" />
      </svg>
    ),
  },
  {
    title: 'Yours',
    body:
      'Non-custodial. We cannot move your money. Every transaction is on Sui mainnet, verifiable by anyone, forever.',
    glyph: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        fill="none"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="stroke-fg-primary"
        aria-hidden="true"
      >
        <path d="M6 15c0-4 3-6 5-6s3 2 4 4 2 4 4 4 5-2 5-6" />
        <path d="M24 15c0 4-3 6-5 6s-3-2-4-4-2-4-4-4-5 2-5 6" />
      </svg>
    ),
  },
];

export function PassportSection() {
  const { login } = useZkLogin();

  return (
    <section
      id="passport"
      className="px-8 py-20 border-t border-border-subtle bg-surface-card"
    >
      <div className="mx-auto max-w-[1120px]">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary mb-4">
          Audric Passport
        </p>
        <h2 className="font-serif font-medium text-[40px] sm:text-[48px] leading-[1.02] tracking-[-0.03em] text-fg-primary max-w-[760px] mb-10">
          Your passport to a new kind of finance.
        </h2>

        <BorderedGrid cols={4}>
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="bg-surface-page p-6">
              <div className="w-8 h-8 mb-5">{pillar.glyph}</div>
              <div className="text-[15px] font-semibold text-fg-primary mb-2">{pillar.title}</div>
              <p className="text-[13px] text-fg-secondary leading-relaxed">{pillar.body}</p>
            </div>
          ))}
        </BorderedGrid>

        <div className="text-center mt-10">
          <button
            type="button"
            onClick={login}
            className="inline-flex items-center gap-2 bg-fg-primary text-fg-inverse px-6 py-3.5 rounded-xs font-mono text-[11px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
          >
            Sign in with Google — get your Passport
          </button>
        </div>
      </div>
    </section>
  );
}
