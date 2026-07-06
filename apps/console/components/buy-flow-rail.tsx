"use client";

import { useEffect, useState } from "react";

// The 5-step buy-flow rail on listing pages. Static labels by default; during
// a live Try-it purchase it LIGHTS UP (founder polish request, 2026-07-03):
// TryItButton broadcasts its phase via a window event (both are islands on a
// server page — an event keeps them decoupled, no context/provider plumbing).
//
// Honesty note: pay → deliver → settle happen inside ONE gateway round trip,
// so during flight those three pulse as a group rather than faking per-step
// progress we can't observe. Done lights everything incl. RECEIPT.

export const BUY_PHASE_EVENT = "t2000-buy-phase";
export type BuyPhase = "idle" | "confirm" | "paying" | "done" | "error";

const STEPS = ["PICK", "PAY", "DELIVER", "SETTLE", "RECEIPT"] as const;

function stepClass(step: (typeof STEPS)[number], phase: BuyPhase): string {
  const base = "font-mono text-[10px] tracking-wider transition-colors";
  const lit = `${base} text-foreground`;
  const pulse = `${base} animate-pulse text-foreground`;
  const dim = `${base} text-fg-subtle`;

  if (phase === "confirm") {
    return step === "PICK" ? lit : dim;
  }
  if (phase === "paying") {
    if (step === "PICK") {
      return lit;
    }
    return step === "RECEIPT" ? dim : pulse;
  }
  if (phase === "done") {
    return lit;
  }
  if (phase === "error") {
    // The attempt stopped mid-rail — PICK/PAY happened, the rest didn't.
    return step === "PICK" || step === "PAY" ? lit : dim;
  }
  return dim;
}

export function BuyFlowRail() {
  const [phase, setPhase] = useState<BuyPhase>("idle");

  useEffect(() => {
    const onPhase = (e: Event) => {
      const detail = (e as CustomEvent<BuyPhase>).detail;
      if (detail) {
        setPhase(detail);
      }
    };
    window.addEventListener(BUY_PHASE_EVENT, onPhase);
    return () => window.removeEventListener(BUY_PHASE_EVENT, onPhase);
  }, []);

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {STEPS.map((s, i) => (
        <div className="flex shrink-0 items-center gap-2" key={s}>
          {i > 0 && <span className="h-px w-4 bg-border/70" />}
          <span className={stepClass(s, phase)}>{s}</span>
        </div>
      ))}
      <span className="ms-2 shrink-0 text-[10px] text-fg-subtle">
        {phase === "done"
          ? "settled on Sui — receipt below"
          : phase === "error"
            ? "stopped — failed delivery auto-refunds"
            : "escrowed · auto-refund on failure · receipt on Sui"}
      </span>
    </div>
  );
}
