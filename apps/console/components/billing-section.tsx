"use client";

import { useCallback, useEffect, useState } from "react";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";

const TOPUP_AMOUNTS = [5, 10, 25, 50];

type AutoRecharge = {
  enabled: boolean;
  thresholdUsd: number;
  amountUsd: number;
  hasCard: boolean;
};

type PaymentMethod = {
  id: string;
  ids: string[];
  type: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  email: string | null;
  isDefault: boolean;
};

type Invoice = {
  id: string;
  created: number;
  amountPaid: number;
  receiptUrl: string | null;
};

type Overview = { invoices: Invoice[]; paymentMethods: PaymentMethod[] };

function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BillingSection({ balance }: { balance: string }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ar, setAr] = useState<AutoRecharge | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    try {
      const [arRes, ovRes] = await Promise.all([
        fetch("/api/billing/auto-recharge"),
        fetch("/api/billing/overview"),
      ]);
      if (arRes.ok) {
        setAr((await arRes.json()) as AutoRecharge);
      }
      if (ovRes.ok) {
        setOverview((await ovRes.json()) as Overview);
      }
    } catch {
      // transient
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  async function pmAction(body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch("/api/billing/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Something went wrong.");
        return;
      }
      if (body.action === "add" && j.url) {
        window.location.href = j.url;
        return;
      }
      await load();
    } catch {
      setError("Something went wrong.");
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
    <div className="space-y-4">
      <Section>
        <div className="text-muted-foreground text-xs">t2000 credit</div>
        <div className="mt-1 font-semibold text-3xl text-foreground tabular-nums">
          ${balance}
        </div>
        <p className="mt-1 text-muted-foreground text-xs">
          Pay-as-you-go across every model. Same balance as your Audric account.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOPUP_AMOUNTS.map((amt) => (
            <Button
              disabled={busy !== null}
              key={amt}
              onClick={() => topUp(amt)}
              size="sm"
              variant="outline"
            >
              {busy === amt ? "…" : `+ $${amt}`}
            </Button>
          ))}
        </div>
        {error ? <p className="mt-2 text-red-500 text-xs">{error}</p> : null}
        <p className="mt-3 text-[11px] text-muted-foreground/60">
          Closed-loop credit: non-refundable, non-withdrawable,
          non-transferable. Card processed securely by Stripe.
        </p>
      </Section>

      <Section>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-foreground text-sm">
              Auto-recharge
            </div>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {ar?.hasCard
                ? `When credit drops below $${ar.thresholdUsd}, add $${ar.amountUsd} automatically.`
                : "Top up once to save a card, then enable auto-recharge."}
            </p>
          </div>
          <Button
            disabled={!ar?.hasCard}
            onClick={() => toggleAutoRecharge(!ar?.enabled)}
            size="sm"
            variant={ar?.enabled ? "default" : "outline"}
          >
            {ar?.enabled ? "On" : "Off"}
          </Button>
        </div>
      </Section>

      <Section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-foreground text-sm">
            Payment methods
          </div>
          <Button
            onClick={() => pmAction({ action: "add" })}
            size="sm"
            variant="outline"
          >
            Add card
          </Button>
        </div>
        {overview?.paymentMethods?.length ? (
          <div className="mt-3 space-y-2">
            {overview.paymentMethods.map((pm) => (
              <div
                className="flex items-center justify-between gap-2 rounded-lg border border-border/40 px-3 py-2 text-sm"
                key={pm.id}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{pm.brand}</span>
                  {pm.type === "card" ? (
                    <>
                      <span className="text-muted-foreground tabular-nums">
                        •••• {pm.last4}
                      </span>
                      <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                        {pm.expMonth}/{pm.expYear}
                      </span>
                    </>
                  ) : (
                    pm.email && (
                      <span className="text-muted-foreground text-xs">
                        {pm.email}
                      </span>
                    )
                  )}
                  {pm.isDefault && (
                    <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-foreground/70">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {pm.isDefault ? null : (
                    <button
                      className="rounded px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() =>
                        pmAction({ action: "default", paymentMethodId: pm.id })
                      }
                      type="button"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    className="rounded px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      pmAction({ action: "detach", paymentMethodIds: pm.ids })
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-muted-foreground text-xs">
            No cards saved yet — add one, or top up (a card you top up with is
            saved automatically).
          </p>
        )}
      </Section>

      {overview?.invoices?.length ? (
        <Section title="Billing history">
          <div className="space-y-1.5">
            {overview.invoices.map((inv) => (
              <div
                className="flex items-center justify-between text-sm"
                key={inv.id}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="tabular-nums">{fmtDate(inv.created)}</span>
                  <span className="text-foreground tabular-nums">
                    ${(Math.floor(inv.amountPaid) / 100).toFixed(2)}
                  </span>
                </div>
                {inv.receiptUrl && (
                  <a
                    className="text-muted-foreground text-xs underline transition-colors hover:text-foreground"
                    href={inv.receiptUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Receipt
                  </a>
                )}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
