"use client";

import { useState } from "react";
import { CONSOLE_PLANS, type ConsolePlanId } from "@/lib/plans";

export function PlansSection({ currentTier }: { currentTier: string | null }) {
  const [busy, setBusy] = useState<ConsolePlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(tier: ConsolePlanId) {
    setBusy(tier);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, acceptedTerms: true }),
      });
      const j = await res.json();
      if (!(res.ok && j.url)) {
        throw new Error(j?.error ?? "Couldn't start checkout.");
      }
      window.location.href = j.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start checkout.");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-5">
      <div className="text-[var(--dim)] text-xs uppercase tracking-wide">
        Plan
      </div>
      <p className="mt-2 text-[var(--muted)] text-sm">
        Subscribe for included monthly credit — spendable on the API and across
        your Audric account. Or just pay-as-you-go with top-ups above.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {CONSOLE_PLANS.map((plan) => {
          const isCurrent = currentTier === plan.id;
          return (
            <div
              className="rounded-lg border border-[var(--border-bright)] p-4"
              key={plan.id}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-[var(--foreground)]">
                  {plan.name}
                </span>
                <span className="text-[var(--muted)] text-sm">
                  ${plan.priceUsd}/mo
                </span>
              </div>
              <div className="mt-1 text-[13px] text-[var(--dim)]">
                ${plan.includedCreditUsd}/mo included credit
              </div>
              <button
                className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 font-medium text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={isCurrent || busy !== null}
                onClick={() => subscribe(plan.id)}
                type="button"
              >
                {(() => {
                  if (isCurrent) {
                    return "Current plan";
                  }
                  if (busy === plan.id) {
                    return "…";
                  }
                  return `Get ${plan.name}`;
                })()}
              </button>
            </div>
          );
        })}
      </div>

      {error ? <p className="mt-2 text-[13px] text-red-400">{error}</p> : null}
    </div>
  );
}
