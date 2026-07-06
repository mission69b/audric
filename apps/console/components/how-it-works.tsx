"use client";

import { useEffect, useRef, useState } from "react";

// The purchase-timeline stepper (SPEC_AGENT_COMMERCE §II.12.A) — the OKX
// "how work gets done" pattern on our restraint. Auto-cycles the active step;
// any interaction (click / hover on the rail) pauses the cycle so it never
// fights the reader. Reused on the store home (buyer steps) and /sell
// (seller steps) via props.

export type Step = {
  /** Short rail label, e.g. "PAY". */
  label: string;
  /** Who acts — rendered as the detail-card kicker, e.g. "BUYER". */
  actor: string;
  /** One-line title for the detail card. */
  title: string;
  /** 1–2 sentence explanation. */
  body: string;
  /** Small key-value facts, e.g. [["token", "USDC"], ["gas", "sponsored"]]. */
  facts: [string, string][];
};

const CYCLE_MS = 4000;

export function HowItWorks({
  heading,
  subheading,
  steps,
  footer,
}: {
  heading: string;
  subheading?: string;
  steps: Step[];
  footer?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) {
      return;
    }
    timer.current = setInterval(() => {
      setActive((i) => (i + 1) % steps.length);
    }, CYCLE_MS);
    return () => {
      if (timer.current) {
        clearInterval(timer.current);
      }
    };
  }, [paused, steps.length]);

  const step = steps[active] ?? steps[0];

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ag-title" style={{ fontSize: "clamp(24px, 2.6vw, 34px)" }}>
          {heading}
        </h2>
        {subheading && (
          <span className="text-fg-subtle text-xs">{subheading}</span>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
        {/* The rail — nodes + connecting line. */}
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute top-[5px] right-1 left-1 h-px bg-border/60"
          />
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}
          >
            {steps.map((s, i) => {
              const isActive = i === active;
              const isPast = i < active;
              return (
                <button
                  className="group flex flex-col items-center gap-2"
                  key={s.label}
                  onClick={() => {
                    setActive(i);
                    setPaused(true);
                  }}
                  type="button"
                >
                  <span
                    className={`relative z-10 h-[11px] w-[11px] rounded-full border transition-colors ${
                      isActive
                        ? "border-foreground bg-foreground"
                        : isPast
                          ? "border-muted-foreground/60 bg-muted-foreground/60"
                          : "border-border bg-background group-hover:border-muted-foreground"
                    }`}
                  />
                  <span
                    className={`font-mono text-[11px] tracking-wider transition-colors ${
                      isActive
                        ? "text-foreground"
                        : "text-fg-subtle group-hover:text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The detail card for the active step. */}
        <div className="mt-4 flex flex-col justify-between gap-4 rounded-xl bg-background/60 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted tracking-wider">
                {step.actor}
              </span>
              <span className="font-medium text-foreground text-sm">
                {step.title}
              </span>
            </div>
            <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
              {step.body}
            </p>
          </div>
          <div className="flex shrink-0 gap-5 border-border/50 sm:border-l sm:pl-5">
            {step.facts.map(([k, v]) => (
              <div key={k}>
                <div className="font-mono text-[10px] text-fg-subtle uppercase tracking-wider">
                  {k}
                </div>
                <div className="mt-0.5 font-mono text-foreground text-xs">
                  [ {v} ]
                </div>
              </div>
            ))}
          </div>
        </div>

        {footer && (
          <div className="mt-3 text-fg-subtle text-xs">{footer}</div>
        )}
      </div>
    </section>
  );
}

/** The buyer timeline — maps 1:1 to the live sync flow. */
export const BUYER_STEPS: Step[] = [
  {
    label: "PICK",
    actor: "YOU",
    title: "Pick a service",
    body: "Browse the shelf. Every listing is a real agent with an on-chain identity and one declared price — what you see is what it costs.",
    facts: [
      ["catalog", "services"],
      ["identity", "on-chain"],
    ],
  },
  {
    label: "PAY",
    actor: "YOU",
    title: "Pay — into escrow, not to the seller",
    body: "One call, no account, no gas. Your money waits in escrow while the work happens. The seller hasn't touched it yet.",
    facts: [
      ["token", "USDC"],
      ["gas", "sponsored"],
      ["held in", "escrow"],
    ],
  },
  {
    label: "DELIVER",
    actor: "GATEWAY",
    title: "The work happens",
    body: "The gateway calls the seller and brings the answer back to you — one round trip, fifteen seconds, or it counts as failed.",
    facts: [
      ["timeout", "15s"],
      ["relay", "one round trip"],
    ],
  },
  {
    label: "SETTLE",
    actor: "GATEWAY",
    title: "Settle — or your money comes back",
    body: "Delivered → the seller gets paid. Failed → every cent returns to you, automatically. There is no claims process, because there are no claims.",
    facts: [
      ["fee", "2.5%"],
      ["refund", "automatic"],
    ],
  },
  {
    label: "RECEIPT",
    actor: "SUI",
    title: "The sale becomes a receipt",
    body: "Every settlement is written to Sui. Reputation here is counted, not reviewed — nobody can fake a track record.",
    facts: [
      ["ledger", "on-chain"],
      ["reputation", "receipt-backed"],
    ],
  },
];
