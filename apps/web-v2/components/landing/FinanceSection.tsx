// [PHASE 13] Marketing — "Your money, working on Sui." section.
// 4-up bordered grid of DeFi capabilities (Save / Credit / Swap / Charts).

import type { ReactNode } from "react";
import { BorderedGrid } from "./BorderedGrid";

interface Feature {
  body: string;
  glyph: ReactNode;
  title: string;
}

const FEATURES: Feature[] = [
  {
    title: "Save",
    body: "Earn 3–8% APY on USDC via NAVI. Withdraw anytime.",
    glyph: (
      <svg
        aria-hidden="true"
        className="stroke-foreground"
        fill="none"
        height="30"
        strokeWidth="1.6"
        viewBox="0 0 30 30"
        width="30"
      >
        <circle cx="15" cy="15" r="10" />
        <circle cx="15" cy="15" r="5" />
      </svg>
    ),
  },
  {
    title: "Credit",
    body: "Borrow against savings. Health factor visible at all times.",
    glyph: (
      <svg
        aria-hidden="true"
        className="stroke-foreground"
        fill="none"
        height="30"
        strokeWidth="1.6"
        viewBox="0 0 30 30"
        width="30"
      >
        <rect height="13" rx="1.5" width="20" x="5" y="9" />
        <path d="M5 14h20" />
        <rect
          className="fill-foreground stroke-none"
          height="2"
          width="5"
          x="8"
          y="17"
        />
      </svg>
    ),
  },
  {
    title: "Swap",
    body: "Convert tokens. Best-route via 20+ DEXs. 0.1% fee.",
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
        <path d="M6 10h17l-3-3M24 20H7l3 3" />
      </svg>
    ),
  },
  {
    title: "Charts",
    body: "Interactive visualizations from conversation. Yield, health, portfolio.",
    glyph: (
      <svg
        aria-hidden="true"
        fill="none"
        height="30"
        viewBox="0 0 30 30"
        width="30"
      >
        <rect className="fill-foreground" height="8" width="4" x="5" y="18" />
        <rect className="fill-foreground" height="14" width="4" x="13" y="12" />
        <rect className="fill-foreground" height="20" width="4" x="21" y="6" />
      </svg>
    ),
  },
];

export function FinanceSection() {
  return (
    <section
      className="px-8 py-20 border-t border-border bg-card"
      id="finance"
    >
      <div className="mx-auto max-w-[1120px]">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-muted-foreground mb-4">
          Audric finance
        </p>
        <h2 className="font-serif font-medium text-[40px] sm:text-[48px] leading-[1.02] tracking-[-0.03em] text-foreground max-w-[760px] mb-5">
          Your money, working on Sui.
        </h2>
        <p className="text-[16px] text-muted-foreground leading-relaxed max-w-[580px] mb-10">
          Save, borrow, swap, see your positions — every DeFi op a user can do,
          all by asking in chat. The Agent Harness picks the right tool, the
          Reasoning Engine clears the guards, and your Passport taps to confirm.
        </p>

        <BorderedGrid cols={4}>
          {FEATURES.map((feat) => (
            <div className="bg-background p-6" key={feat.title}>
              <div className="w-8 h-8 mb-5">{feat.glyph}</div>
              <div className="text-[15px] font-semibold text-foreground mb-2">
                {feat.title}
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {feat.body}
              </p>
            </div>
          ))}
        </BorderedGrid>
      </div>
    </section>
  );
}
