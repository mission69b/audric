"use client";

import { Button, Card, CardContent, cn } from "@t2000/ui";
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
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div>
          <p className="text-muted-foreground text-sm">
            Pay-as-you-go — top up with a card and spend per-token across every
            model. Same balance as your Audric account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {TOPUP_AMOUNTS.map((amt) => (
              <Button
                disabled={busy !== null}
                key={amt}
                onClick={() => topUp(amt)}
                variant="outline"
              >
                {busy === amt ? "…" : `$${amt}`}
              </Button>
            ))}
          </div>
          {error ? (
            <p className="mt-2 text-destructive text-sm">{error}</p>
          ) : null}
          <p className="mt-3 text-muted-foreground text-xs">
            Credit is closed-loop: non-refundable, non-withdrawable,
            non-transferable. Card processed securely by Stripe.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-border border-t pt-5">
          <div>
            <div className="font-medium text-foreground text-sm">
              Auto-recharge
            </div>
            <div className="text-muted-foreground text-xs">
              {ar?.hasCard
                ? `Add $${ar.amountUsd} when balance drops below $${ar.thresholdUsd}.`
                : "Top up once to save a card, then enable auto-recharge."}
            </div>
          </div>
          <button
            aria-pressed={ar?.enabled ?? false}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
              ar?.enabled ? "bg-accent" : "bg-muted"
            )}
            disabled={!ar?.hasCard}
            onClick={() => toggleAutoRecharge(!ar?.enabled)}
            type="button"
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white transition-transform",
                ar?.enabled ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
