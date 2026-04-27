// [PHASE 13] Marketing — "Not a chatbot. A financial agent." section.
// 5-up bordered grid of intelligence pillars.
//
// Glyphs are inline SVGs (each pillar has its own bespoke illustration).
// The two color accents (#FFBD14 / #F155A0) are inline literal hex per
// the design handoff convention (illustrative brand colors, not tokens).

import { BorderedGrid } from './BorderedGrid';
import type { ReactNode } from 'react';

interface Pillar {
  title: string;
  italic: string;
  body: string;
  glyph: ReactNode;
}

const PILLARS: Pillar[] = [
  {
    title: 'Agent Harness',
    italic: '34 tools. One agent.',
    body:
      'The runtime that manages your money: balances, DeFi, analytics, payments — all orchestrated by a single conversation.',
    glyph: (
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="10" height="10" rx="1" className="fill-fg-primary" />
        <rect x="17" y="3" width="10" height="10" rx="1" className="fill-fg-primary" />
        <rect x="3" y="17" width="10" height="10" rx="1" className="fill-fg-primary" />
        <rect x="17" y="17" width="10" height="10" rx="1" className="fill-fg-primary" />
      </svg>
    ),
  },
  {
    title: 'Reasoning Engine',
    italic: 'Thinks before it acts.',
    body:
      'Classifies complexity, matches skill recipes, runs 9 safety guards before every transaction. You see its reasoning.',
    glyph: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="#FFBD14" aria-hidden="true">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
      </svg>
    ),
  },
  {
    title: 'Silent Profile',
    italic: 'Knows your finances.',
    body:
      'Builds a private financial profile from your chat history and a daily on-chain snapshot of your savings, debt, and yield. Every chat starts oriented — no warm-up tool calls. Never surfaced as nudges.',
    glyph: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3c5 0 9 4 9 9 0 4-3 8-9 8s-9-4-9-8c0-5 4-9 9-9Z" fill="#F155A0" />
        <path
          d="M7 14c2 0 3-1 3-3M14 13c2 0 3-1 3-3"
          stroke="#4B112D"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: 'Chain Memory',
    italic: 'Remembers what you do on-chain.',
    body:
      'Reads your wallet history into structured facts the agent uses as context — recurring sends, idle balances, position changes.',
    glyph: (
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-fg-primary"
        aria-hidden="true"
      >
        <path d="M10 14 7.5 16.5a3.54 3.54 0 0 1-5-5L5 9M14 10l2.5-2.5a3.54 3.54 0 0 1 5 5L19 15M9 15l6-6" />
      </svg>
    ),
  },
  {
    title: 'AdviceLog',
    italic: 'Remembers what it told you.',
    body:
      "Every recommendation Audric makes is logged so it doesn't contradict itself across sessions. No two answers about the same topic.",
    glyph: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="1" className="fill-fg-primary" />
        <rect x="8" y="6" width="8" height="1.2" className="fill-surface-card" />
        <rect x="8" y="9" width="6" height="1.2" className="fill-surface-card" />
        <rect x="8" y="12" width="7" height="1.2" className="fill-surface-card" />
      </svg>
    ),
  },
];

export function IntelligenceSection() {
  return (
    <section id="intelligence" className="px-8 py-20 border-t border-border-subtle">
      <div className="mx-auto max-w-[1120px] text-center">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary mb-4">
          Audric Intelligence
        </p>
        <h2 className="font-serif font-medium text-[40px] sm:text-[48px] leading-[1.02] tracking-[-0.03em] text-fg-primary mx-auto max-w-[760px]">
          Not a chatbot.
          <br />
          A financial agent.
        </h2>
        <p className="text-[16px] text-fg-secondary leading-relaxed max-w-[580px] mx-auto mt-5 mb-10">
          Five systems work together to understand your money, reason about decisions, and get
          smarter over time. Every action still waits on your confirmation.
        </p>

        <div className="text-left">
          <BorderedGrid cols={5}>
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="bg-surface-card p-6">
                <div className="w-9 h-9 mb-6 grid place-items-center">{pillar.glyph}</div>
                <div className="text-[15px] font-semibold text-fg-primary mb-0.5">{pillar.title}</div>
                <div className="font-serif italic text-[13px] text-fg-secondary mb-3">
                  {pillar.italic}
                </div>
                <p className="text-[13px] text-fg-secondary leading-relaxed">{pillar.body}</p>
              </div>
            ))}
          </BorderedGrid>
        </div>
      </div>
    </section>
  );
}
