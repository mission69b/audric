"use client";

/**
 * Settings → Billing (Phase 5, SPEC_AUDRIC_TOPUP_METERING §5b). Overlay over
 * the persistent chat shell. Pay-as-you-go top-up (hosted Stripe Checkout) +
 * auto-recharge + the "Audric difference" (shared, benefit-led) + the 3-tier
 * plan cards (subscribe inert until prices are provisioned) + a "coming soon"
 * tease. Closed-loop terms are accepted at the first top-up (§6b).
 */

import { CheckIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { AddCard } from "@/components/chat/billing/add-card";
import { useUpgradeModal } from "@/components/pricing/upgrade-modal";
import { Button } from "@/components/ui/button";
import { COMING_SOON, EVERY_PLAN, TOPUP_PRESETS_USD } from "@/lib/credit/tiers";
import { fetcher } from "@/lib/utils";
import { payStablecoinTopup, type TopupAsset } from "@/lib/wallet/usdc-topup";

type BillingOverview = {
  configured: boolean;
  nativeEnabled: boolean;
  subscription: {
    tier: string | null;
    status: string;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  invoices: {
    id: string;
    created: number;
    amountPaid: number;
    currency: string;
    status: string | null;
    number: string | null;
    hostedUrl: string | null;
    pdfUrl: string | null;
    receiptUrl: string | null;
  }[];
  paymentMethods: {
    id: string;
    ids: string[];
    type: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    email: string | null;
    isDefault: boolean;
  }[];
};

function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type CreditState = {
  configured: boolean;
  balanceUsd: number | null;
  hasCard?: boolean;
  acceptedTerms?: boolean;
  tier?: string;
  subscribableTiers?: string[];
  autoRecharge?: { enabled: boolean; thresholdUsd: number; amountUsd: number };
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null) {
    return "—";
  }
  return `$${(Math.floor(n * 100) / 100).toFixed(2)}`;
}

export default function BillingPage() {
  const router = useRouter();
  const { openUpgrade } = useUpgradeModal();
  const { data, mutate } = useSWR<CreditState>(
    `${BASE}/api/credit/balance`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usdcBusy, setUsdcBusy] = useState<number | null>(null);
  const [usdcAsset, setUsdcAsset] = useState<TopupAsset>("USDC");

  const needsTerms = data?.configured && !data?.acceptedTerms;

  async function payStable(amount: number) {
    if (needsTerms && !terms) {
      toast.error("Please accept the credit terms first.");
      return;
    }
    setUsdcBusy(amount);
    try {
      const res = await payStablecoinTopup(amount, usdcAsset);
      toast.success(
        res.credited
          ? `Added $${res.amountUsd} — credited from ${res.asset}.`
          : "That payment was already credited."
      );
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Top-up failed.");
    } finally {
      setUsdcBusy(null);
    }
  }

  // Both flows now go to the in-app embedded /checkout page (on audric.ai),
  // which mounts Stripe Embedded Checkout (Link / saved cards / one-click intact)
  // + the personalized wrapper. Keep the terms gate before navigating.
  function topUp(amountUsd: number) {
    if (needsTerms && !terms) {
      toast.error("Please accept the credit terms first.");
      return;
    }
    router.push(`${BASE}/checkout?topup=${amountUsd}`);
  }

  const { data: billing, mutate: mutateBilling } = useSWR<BillingOverview>(
    `${BASE}/api/billing`,
    fetcher,
    { revalidateOnFocus: false }
  );

  async function billingAction(
    path: string,
    body: Record<string, unknown>,
    okMsg?: string
  ) {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/billing/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Something went wrong.");
        return;
      }
      if (okMsg) {
        toast.success(okMsg);
      }
      await Promise.all([mutateBilling(), mutate()]);
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function setAutoRecharge(enabled: boolean) {
    try {
      const res = await fetch(`${BASE}/api/credit/auto-recharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          thresholdUsd: data?.autoRecharge?.thresholdUsd ?? 5,
          amountUsd: data?.autoRecharge?.amountUsd ?? 20,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Couldn't update auto-recharge.");
        return;
      }
      mutate();
    } catch {
      toast.error("Couldn't update auto-recharge.");
    }
  }

  if (data && !data.configured) {
    return (
      <Overlay onClose={() => router.push(`${BASE}/`)}>
        <p className="text-muted-foreground text-sm">
          Billing isn't enabled in this environment.
        </p>
      </Overlay>
    );
  }

  const ar = data?.autoRecharge;

  return (
    <Overlay onClose={() => router.push(`${BASE}/`)}>
      <h1 className="font-semibold text-foreground text-xl">Billing</h1>

      {/* Balance */}
      <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
        <div className="text-muted-foreground text-xs">Audric credit</div>
        <div className="mt-1 font-semibold text-3xl text-foreground tabular-nums">
          {fmtUsd(data?.balanceUsd)}
        </div>
        <p className="mt-1 text-muted-foreground text-xs">
          Spent on premium models. The free model (Kimi) is always included.
        </p>

        {needsTerms && (
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-muted-foreground text-xs">
            <input
              checked={terms}
              className="mt-0.5"
              onChange={(e) => setTerms(e.target.checked)}
              type="checkbox"
            />
            <span>
              I understand Audric credit is <strong>non-refundable</strong>,{" "}
              <strong>non-withdrawable</strong>, and spendable only on Audric.
            </span>
          </label>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {TOPUP_PRESETS_USD.map((amt) => (
            <Button
              disabled={busy || (needsTerms && !terms)}
              key={amt}
              onClick={() => topUp(amt)}
              size="sm"
              type="button"
              variant="outline"
            >
              + ${amt}
            </Button>
          ))}
        </div>
      </div>

      {/* Pay with stablecoin (Sui) — gasless, from the Passport. Same balance. */}
      <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
        <div className="font-medium text-foreground text-sm">
          Pay with stablecoin (Sui)
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs">
          Top up gaslessly from your Passport — no card. You sign the transfer;
          we credit the exact amount received. 1 USDC / USDsui = $1.
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-border/50 p-0.5">
          {(["USDC", "USDsui"] as TopupAsset[]).map((a) => (
            <button
              className={
                usdcAsset === a
                  ? "rounded-md bg-foreground/10 px-2.5 py-1 font-medium text-foreground text-xs"
                  : "rounded-md px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
              }
              disabled={usdcBusy !== null}
              key={a}
              onClick={() => setUsdcAsset(a)}
              type="button"
            >
              {a}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOPUP_PRESETS_USD.map((amt) => (
            <Button
              disabled={usdcBusy !== null || (needsTerms && !terms)}
              key={amt}
              onClick={() => payStable(amt)}
              size="sm"
              type="button"
              variant="outline"
            >
              {usdcBusy === amt ? "Confirming…" : `${amt} ${usdcAsset}`}
            </Button>
          ))}
        </div>
      </div>

      {/* Auto-recharge */}
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-border/50 bg-card/40 p-5">
        <div>
          <div className="font-medium text-foreground text-sm">
            Auto-recharge
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {data?.hasCard
              ? `When credit drops below $${ar?.thresholdUsd ?? 5}, add $${ar?.amountUsd ?? 20} automatically.`
              : "Top up once to save a card, then enable auto-recharge."}
          </p>
        </div>
        <Button
          disabled={!data?.hasCard}
          onClick={() => setAutoRecharge(!ar?.enabled)}
          size="sm"
          type="button"
          variant={ar?.enabled ? "default" : "outline"}
        >
          {ar?.enabled ? "On" : "Off"}
        </Button>
      </div>

      {/* Subscription — plan, renewal/cancel state, native cancel/resume. */}
      {billing?.subscription && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-border/50 bg-card/40 p-5">
          <div>
            <div className="font-medium text-foreground text-sm capitalize">
              {billing.subscription.tier ?? "Subscription"} plan
            </div>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {billing.subscription.cancelAtPeriodEnd
                ? `Cancels on ${billing.subscription.currentPeriodEnd ? fmtDate(billing.subscription.currentPeriodEnd) : "period end"} — you keep access until then.`
                : `Renews${billing.subscription.currentPeriodEnd ? ` on ${fmtDate(billing.subscription.currentPeriodEnd)}` : ""}.`}
            </p>
          </div>
          {billing.subscription.cancelAtPeriodEnd ? (
            <Button
              disabled={busy}
              onClick={() =>
                billingAction(
                  "subscription",
                  { action: "resume" },
                  "Subscription resumed."
                )
              }
              size="sm"
              type="button"
              variant="default"
            >
              Resume
            </Button>
          ) : (
            <Button
              disabled={busy}
              onClick={() =>
                billingAction(
                  "subscription",
                  { action: "cancel" },
                  "Subscription will cancel at period end."
                )
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel plan
            </Button>
          )}
        </div>
      )}

      {/* Payment methods — saved cards + native add (Payment Element). */}
      {data?.configured && (
        <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="flex items-center justify-between">
            <div className="font-medium text-foreground text-sm">
              Payment methods
            </div>
            <AddCard onAdded={() => mutateBilling()} />
          </div>
          {billing?.paymentMethods?.length ? (
            <div className="mt-3 space-y-2">
              {billing.paymentMethods.map((pm) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2 text-sm"
                  key={pm.id}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{pm.brand}</span>
                    {pm.type === "card" ? (
                      <>
                        <span className="text-muted-foreground tabular-nums">
                          •••• {pm.last4}
                        </span>
                        <span className="text-muted-foreground/60 text-xs tabular-nums">
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
                    {!pm.isDefault && (
                      <button
                        className="rounded px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        disabled={busy}
                        onClick={() =>
                          billingAction(
                            "payment-method",
                            { action: "default", paymentMethodId: pm.id },
                            "Default card updated."
                          )
                        }
                        type="button"
                      >
                        Make default
                      </button>
                    )}
                    <button
                      className="rounded px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      disabled={busy}
                      onClick={() =>
                        billingAction(
                          "payment-method",
                          { action: "detach", paymentMethodIds: pm.ids },
                          "Payment method removed."
                        )
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
            <p className="mt-2 text-muted-foreground text-xs">
              No cards saved yet. Add one, or top up — a card you use to top up
              is saved automatically.
            </p>
          )}
        </div>
      )}

      {/* Invoices — billing history with PDF/hosted links. */}
      {billing?.invoices?.length ? (
        <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="font-medium text-foreground text-sm">
            Billing history
          </div>
          <div className="mt-3 space-y-1.5">
            {billing.invoices.map((inv) => (
              <div
                className="flex items-center justify-between text-sm"
                key={inv.id}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="tabular-nums">{fmtDate(inv.created)}</span>
                  <span className="text-foreground tabular-nums">
                    {fmtUsd(inv.amountPaid / 100)}
                  </span>
                  {inv.status && inv.status !== "paid" && (
                    <span className="text-amber-600 text-xs capitalize">
                      {inv.status}
                    </span>
                  )}
                </div>
                {(inv.hostedUrl || inv.pdfUrl || inv.receiptUrl) && (
                  <a
                    className="text-muted-foreground text-xs underline transition-colors hover:text-foreground"
                    href={
                      (inv.hostedUrl ?? inv.pdfUrl ?? inv.receiptUrl) as string
                    }
                    rel="noreferrer"
                    target="_blank"
                  >
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* The Audric difference — included in EVERY plan (the real, shared value) */}
      <div className="mt-8 rounded-2xl border border-border/50 bg-card/40 p-5">
        <h2 className="font-medium text-foreground text-sm">
          Included in every plan
        </h2>
        <p className="mt-0.5 text-muted-foreground text-xs">
          What Audric is — Free included.
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {EVERY_PLAN.map((f) => (
            <li
              className="flex items-start gap-1.5 text-muted-foreground text-xs"
              key={f}
            >
              <CheckIcon className="mt-0.5 size-3 shrink-0 text-foreground/50" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Plans (scaffold — Subscribe inert until prices are provisioned) */}
      <h2 className="mt-8 font-medium text-foreground text-sm">Plans</h2>
      <p className="mt-0.5 mb-3 text-muted-foreground text-xs">
        {data?.subscribableTiers?.length
          ? "Subscribe for monthly included credit. Pay-as-you-go top-up works on any plan."
          : "Pricing is being finalized — subscriptions open soon. Pay-as-you-go works today."}
      </p>
      {needsTerms && data?.subscribableTiers?.length ? (
        <label className="mb-3 flex cursor-pointer items-start gap-2 text-muted-foreground text-xs">
          <input
            checked={terms}
            className="mt-0.5"
            onChange={(e) => setTerms(e.target.checked)}
            type="checkbox"
          />
          <span>
            I understand Audric credit is <strong>non-refundable</strong>,{" "}
            <strong>non-withdrawable</strong>, and spendable only on Audric.
          </span>
        </label>
      ) : null}
      {/* Plan selection lives in ONE place (the shared pricing overlay) — this
          is the management view: current plan + "change" opens the overlay. */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/40 p-5">
        <div>
          <div className="font-medium text-foreground text-sm capitalize">
            {data?.tier && data.tier !== "free"
              ? `${data.tier} plan`
              : "Free plan"}
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {data?.tier && data.tier !== "free"
              ? "Manage or change your plan anytime."
              : "Upgrade for every frontier model + monthly credit that never expires."}
          </p>
        </div>
        <Button onClick={openUpgrade} size="sm" type="button">
          {data?.tier && data.tier !== "free" ? "Change plan" : "View plans"}
        </Button>
      </div>

      {/* Coming soon — teased, not sold */}
      <div className="mt-4 rounded-2xl border border-border/40 border-dashed p-4">
        <div className="font-medium text-muted-foreground text-xs">
          Coming soon
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {COMING_SOON.map((f) => (
            <li className="text-muted-foreground/70 text-xs" key={f}>
              · {f}
            </li>
          ))}
        </ul>
      </div>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <button
          aria-label="Back to chat"
          className="float-right rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <XIcon className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
