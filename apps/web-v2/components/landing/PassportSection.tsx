// [PHASE 13] Marketing — "Your passport to a new kind of finance." section.
// 4-up bordered grid + centered CTA below.
//
// CTA preserved: invokes `useZkLogin().login` (was the same in the old monolith).

"use client";

import type { ReactNode } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { BorderedGrid } from "./BorderedGrid";

interface Pillar {
  body: string;
  glyph: ReactNode;
  title: string;
}

const PILLARS: Pillar[] = [
  {
    title: "Identity",
    body: "Sign in with Google. Claim your username — you@audric. Your Passport is your identity and your wallet, created in 3 seconds. No seed phrase. Yours forever.",
    glyph: (
      <svg
        aria-hidden="true"
        fill="none"
        height="30"
        viewBox="0 0 30 30"
        width="30"
      >
        <rect
          className="fill-foreground"
          height="18"
          rx="2"
          width="24"
          x="3"
          y="6"
        />
        <rect
          className="fill-card"
          height="7"
          rx="3.5"
          width="7"
          x="7"
          y="10"
        />
        <rect
          className="fill-card"
          height="1.2"
          width="8"
          x="16"
          y="11"
        />
        <rect
          className="fill-card"
          height="1.2"
          width="6"
          x="16"
          y="14"
        />
        <rect
          className="fill-card"
          height="1.2"
          width="16"
          x="7"
          y="19"
        />
      </svg>
    ),
  },
  {
    title: "You decide",
    body: "Audric never moves money on its own. Every save, send, swap, and borrow waits on your tap-to-confirm.",
    glyph: (
      <svg
        aria-hidden="true"
        className="stroke-foreground"
        fill="none"
        height="30"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        viewBox="0 0 30 30"
        width="30"
      >
        <path d="M6 15l4 4 10-10" />
        <circle cx="15" cy="15" r="12" />
      </svg>
    ),
  },
  {
    title: "Sponsored gas",
    body: "We pay the network fees so you don't need SUI to transact. Your USDC stays your USDC.",
    glyph: (
      <svg
        aria-hidden="true"
        fill="none"
        height="30"
        viewBox="0 0 30 30"
        width="30"
      >
        <rect
          className="fill-foreground"
          height="13"
          rx="1.5"
          width="18"
          x="6"
          y="13"
        />
        <path
          className="stroke-foreground"
          d="M10 13v-3a5 5 0 0 1 10 0v3"
          fill="none"
          strokeWidth="1.8"
        />
        <circle className="fill-card" cx="15" cy="19" r="1.8" />
      </svg>
    ),
  },
  {
    title: "Yours",
    body: "Non-custodial. We cannot move your money. Every transaction is on Sui mainnet, verifiable by anyone, forever.",
    glyph: (
      <svg
        aria-hidden="true"
        className="stroke-foreground"
        fill="none"
        height="30"
        strokeLinecap="round"
        strokeWidth="1.8"
        viewBox="0 0 30 30"
        width="30"
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
      className="px-8 py-20 border-t border-border bg-card"
      id="passport"
    >
      <div className="mx-auto max-w-[1120px]">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-foreground mb-4">
          Audric Passport
        </p>
        <h2 className="font-serif font-medium text-[40px] sm:text-[48px] leading-[1.02] tracking-[-0.03em] text-foreground max-w-[760px] mb-10">
          Your passport to a new kind of finance.
        </h2>

        <BorderedGrid cols={4}>
          {PILLARS.map((pillar) => (
            <div className="bg-background p-6" key={pillar.title}>
              <div className="w-8 h-8 mb-5">{pillar.glyph}</div>
              <div className="text-[15px] font-semibold text-foreground mb-2">
                {pillar.title}
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {pillar.body}
              </p>
            </div>
          ))}
        </BorderedGrid>

        <div className="text-center mt-10">
          <button
            className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3.5 rounded-xs font-mono text-[11px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
            onClick={login}
            type="button"
          >
            Sign in with Google — get your Passport
          </button>
        </div>
      </div>
    </section>
  );
}
