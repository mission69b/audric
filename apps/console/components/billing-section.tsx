"use client";

import { useCallback, useEffect, useState } from "react";

const TOPUP_AMOUNTS = [5, 10, 25, 50];

type AutoRecharge = {
  enabled: boolean;
  thresholdUsd: number;
  amountUsd: number;
  hasCard: boolean;
};

export function BillingSection() {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ar, setAr] = useState<AutoRecharge | null>(null);

  const loadAr = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/auto-recharge");
      if (res.ok) {
        setAr((await res.json()) as AutoRecharge);
      }
    } catch {
      // transient
    }
  }, []);

  useEffect(() => {
    loadAr();
  }, [loadAr]);

  async function topUp(amountUsd: number) {
    setBusy(amountUsd);
    setError(null);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd, acceptedTerms: true }),
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

  async function toggleAutoRecharge(enabled: boolean) {
    if (!ar) {
      return;
    }
    setAr({ ...ar, enabled });
    try {
      await fetch("/api/billing/auto-recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    } catch {
      setAr({ ...ar, enabled: !enabled });
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-5">
      <div className="text-[var(--dim)] text-xs uppercase tracking-wide">
        Add credit
      </div>
      <p className="mt-2 text-[var(--muted)] text-sm">
        Pay-as-you-go — top up with a card and spend per-token across every
        model. Same balance as your Audric account.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {TOPUP_AMOUNTS.map((amt) => (
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border-bright)] px-4 font-medium text-[var(--foreground)] text-sm transition-colors hover:border-[var(--accent)] disabled:opacity-60"
            disabled={busy !== null}
            key={amt}
            onClick={() => topUp(amt)}
            type="button"
          >
            {busy === amt ? "…" : `$${amt}`}
          </button>
        ))}
      </div>

      {error ? <p className="mt-2 text-[13px] text-red-400">{error}</p> : null}

      <p className="mt-3 text-[11px] text-[var(--dim)]">
        Credit is closed-loop: non-refundable, non-withdrawable,
        non-transferable. Card processed securely by Stripe.
      </p>

      {/* Auto-recharge */}
      <div className="mt-5 border-[var(--border-bright)] border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[var(--foreground)] text-sm">
              Auto-recharge
            </div>
            <div className="text-[11px] text-[var(--dim)]">
              {ar?.hasCard
                ? `Add $${ar.amountUsd} when balance drops below $${ar.thresholdUsd}.`
                : "Top up once to save a card, then enable auto-recharge."}
            </div>
          </div>
          <button
            aria-pressed={ar?.enabled ?? false}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              ar?.enabled ? "bg-[var(--accent)]" : "bg-[var(--border-bright)]"
            } disabled:opacity-50`}
            disabled={!ar?.hasCard}
            onClick={() => toggleAutoRecharge(!ar?.enabled)}
            type="button"
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
                ar?.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
