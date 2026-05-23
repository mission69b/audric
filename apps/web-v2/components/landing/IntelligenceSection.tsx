// [PHASE 13] Marketing — "Not a chatbot. A financial agent." section.
// 4-up bordered grid of intelligence pillars. (Was 5-up pre-v0.7d
// Block A; Silent Profile + Chain Memory collapsed into a single
// MemWal-backed "Memory" pillar 2026-05-22 per CLAUDE.md 4-system
// framing.)
//
// Glyphs are inline SVGs (each pillar has its own bespoke illustration).
// The two color accents (#FFBD14 / #F155A0) are inline literal hex per
// the design handoff convention (illustrative brand colors, not tokens).

import type { ReactNode } from "react";
import { BorderedGrid } from "./BorderedGrid";

interface Pillar {
  body: string;
  glyph: ReactNode;
  italic: string;
  title: string;
}

const PILLARS: Pillar[] = [
  {
    title: "Agent Harness",
    italic: "26 tools. One agent.",
    body: "The runtime that manages your money: balances, DeFi, analytics, payments — all orchestrated by a single conversation.",
    glyph: (
      <svg
        aria-hidden="true"
        fill="none"
        height="30"
        viewBox="0 0 30 30"
        width="30"
      >
        <rect
          className="fill-fg-primary"
          height="10"
          rx="1"
          width="10"
          x="3"
          y="3"
        />
        <rect
          className="fill-fg-primary"
          height="10"
          rx="1"
          width="10"
          x="17"
          y="3"
        />
        <rect
          className="fill-fg-primary"
          height="10"
          rx="1"
          width="10"
          x="3"
          y="17"
        />
        <rect
          className="fill-fg-primary"
          height="10"
          rx="1"
          width="10"
          x="17"
          y="17"
        />
      </svg>
    ),
  },
  {
    title: "Reasoning Engine",
    italic: "Thinks before it acts.",
    body: "Classifies complexity, picks the right skill playbook, runs 14 safety guards before every transaction. You see its reasoning.",
    glyph: (
      <svg
        aria-hidden="true"
        fill="#FFBD14"
        height="30"
        viewBox="0 0 24 24"
        width="30"
      >
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
      </svg>
    ),
  },
  {
    title: "Memory",
    italic: "Knows you. Remembers what matters.",
    body: "Builds a private model of your savings, debt, yield, preferences, and on-chain patterns. Every chat starts oriented — no warm-up tool calls. Never surfaced as nudges.",
    glyph: (
      <svg
        aria-hidden="true"
        fill="none"
        height="30"
        viewBox="0 0 24 24"
        width="30"
      >
        <path
          d="M12 3c5 0 9 4 9 9 0 4-3 8-9 8s-9-4-9-8c0-5 4-9 9-9Z"
          fill="#F155A0"
        />
        <path
          d="M7 14c2 0 3-1 3-3M14 13c2 0 3-1 3-3"
          stroke="#4B112D"
          strokeLinecap="round"
          strokeWidth="1.2"
        />
      </svg>
    ),
  },
  {
    title: "AdviceLog",
    italic: "Remembers what it told you.",
    body: "Every recommendation Audric makes is logged so it doesn't contradict itself across sessions. No two answers about the same topic.",
    glyph: (
      <svg
        aria-hidden="true"
        fill="none"
        height="30"
        viewBox="0 0 24 24"
        width="30"
      >
        <rect
          className="fill-fg-primary"
          height="18"
          rx="1"
          width="14"
          x="5"
          y="3"
        />
        <rect
          className="fill-surface-card"
          height="1.2"
          width="8"
          x="8"
          y="6"
        />
        <rect
          className="fill-surface-card"
          height="1.2"
          width="6"
          x="8"
          y="9"
        />
        <rect
          className="fill-surface-card"
          height="1.2"
          width="7"
          x="8"
          y="12"
        />
      </svg>
    ),
  },
];

export function IntelligenceSection() {
  return (
    <section
      className="px-8 py-20 border-t border-border-subtle"
      id="intelligence"
    >
      <div className="mx-auto max-w-[1120px] text-center">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary mb-4">
          Audric Intelligence
        </p>
        <h2 className="font-serif font-medium text-[40px] sm:text-[48px] leading-[1.02] tracking-[-0.03em] text-fg-primary mx-auto max-w-[760px]">
          Not a chatbot.
          <br />A financial agent.
        </h2>
        <p className="text-[16px] text-fg-secondary leading-relaxed max-w-[580px] mx-auto mt-5 mb-10">
          Four systems work together to understand your money, reason about
          decisions, and get smarter over time. Every action still waits on your
          confirmation.
        </p>

        <div className="text-left">
          <BorderedGrid cols={4}>
            {PILLARS.map((pillar) => (
              <div className="bg-surface-card p-6" key={pillar.title}>
                <div className="w-9 h-9 mb-6 grid place-items-center">
                  {pillar.glyph}
                </div>
                <div className="text-[15px] font-semibold text-fg-primary mb-0.5">
                  {pillar.title}
                </div>
                <div className="font-serif italic text-[13px] text-fg-secondary mb-3">
                  {pillar.italic}
                </div>
                <p className="text-[13px] text-fg-secondary leading-relaxed">
                  {pillar.body}
                </p>
              </div>
            ))}
          </BorderedGrid>
        </div>
      </div>
    </section>
  );
}
