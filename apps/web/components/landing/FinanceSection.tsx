// [PHASE 13] Marketing — "Your money, working on Sui." section.
// 4-up bordered grid of DeFi capabilities (Save / Credit / Swap / Charts).

import type { ReactNode } from 'react';
import { BorderedGrid } from './BorderedGrid';

interface Feature {
  title: string;
  body: string;
  glyph: ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: 'Save',
    body: 'Earn 3–8% APY on USDC via NAVI. Withdraw anytime.',
    glyph: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        fill="none"
        strokeWidth="1.6"
        className="stroke-fg-primary"
        aria-hidden="true"
      >
        <circle cx="15" cy="15" r="10" />
        <circle cx="15" cy="15" r="5" />
      </svg>
    ),
  },
  {
    title: 'Credit',
    body: 'Borrow against savings. Health factor visible at all times.',
    glyph: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        fill="none"
        strokeWidth="1.6"
        className="stroke-fg-primary"
        aria-hidden="true"
      >
        <rect x="5" y="9" width="20" height="13" rx="1.5" />
        <path d="M5 14h20" />
        <rect x="8" y="17" width="5" height="2" className="fill-fg-primary stroke-none" />
      </svg>
    ),
  },
  {
    title: 'Swap',
    body: 'Convert tokens. Best-route via 20+ DEXs. 0.1% fee.',
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
        <path d="M6 10h17l-3-3M24 20H7l3 3" />
      </svg>
    ),
  },
  {
    title: 'Charts',
    body: 'Interactive visualizations from conversation. Yield, health, portfolio.',
    glyph: (
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <rect x="5" y="18" width="4" height="8" className="fill-fg-primary" />
        <rect x="13" y="12" width="4" height="14" className="fill-fg-primary" />
        <rect x="21" y="6" width="4" height="20" className="fill-fg-primary" />
      </svg>
    ),
  },
];

export function FinanceSection() {
  return (
    <section
      id="finance"
      className="px-8 py-20 border-t border-border-subtle bg-surface-card"
    >
      <div className="mx-auto max-w-[1120px]">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary mb-4">
          Audric finance
        </p>
        <h2 className="font-serif font-medium text-[40px] sm:text-[48px] leading-[1.02] tracking-[-0.03em] text-fg-primary max-w-[760px] mb-5">
          Your money, working on Sui.
        </h2>
        <p className="text-[16px] text-fg-secondary leading-relaxed max-w-[580px] mb-10">
          Save, borrow, swap, see your positions — every DeFi op a user can do, all by asking in
          chat. The Agent Harness picks the right tool, the Reasoning Engine clears the guards,
          and your Passport taps to confirm.
        </p>

        <BorderedGrid cols={4}>
          {FEATURES.map((feat) => (
            <div key={feat.title} className="bg-surface-page p-6">
              <div className="w-8 h-8 mb-5">{feat.glyph}</div>
              <div className="text-[15px] font-semibold text-fg-primary mb-2">{feat.title}</div>
              <p className="text-[13px] text-fg-secondary leading-relaxed">{feat.body}</p>
            </div>
          ))}
        </BorderedGrid>
      </div>
    </section>
  );
}
