"use client";

/**
 * Settings → Billing (Phase 5, SPEC_AUDRIC_TOPUP_METERING §5b). Overlay over
 * the persistent chat shell. Pay-as-you-go top-up (hosted Stripe Checkout) +
 * auto-recharge + the 4-tier plan cards (subscribe inert until prices are
 * provisioned). Closed-loop terms are accepted at the first top-up (§6b).
 */

import { CheckIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { TIERS, TOPUP_PRESETS_USD } from "@/lib/credit/tiers";
import { cn, fetcher } from "@/lib/utils";

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
  const { data, mutate } = useSWR<CreditState>(
    `${BASE}/api/credit/balance`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  const needsTerms = data?.configured && !data?.acceptedTerms;

  async function topUp(amountUsd: number) {
    if (needsTerms && !terms) {
      toast.error("Please accept the credit terms first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/credit/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd, acceptedTerms: terms }),
      });
      const j = await res.json();
      if (j.url) {
        window.location.href = j.url;
        return;
      }
      toast.error(j.error ?? "Couldn't start checkout.");
    } catch {
      toast.error("Couldn't start checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function subscribe(tier: string) {
    if (needsTerms && !terms) {
      toast.error("Please accept the credit terms first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/credit/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, acceptedTerms: terms }),
      });
      const j = await res.json();
      if (j.url) {
        window.location.href = j.url;
        return;
      }
      toast.error(j.error ?? "Couldn't start checkout.");
    } catch {
      toast.error("Couldn't start checkout.");
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier) => {
          const current = (data?.tier ?? "free") === tier.id;
          return (
            <div
              className={cn(
                "flex flex-col rounded-2xl border p-4",
                current
                  ? "border-foreground/40 bg-card/60"
                  : "border-border/50 bg-card/30"
              )}
              key={tier.id}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-foreground">{tier.name}</h3>
                {current && (
                  <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground/70">
                    Current
                  </span>
                )}
              </div>
              <div className="mt-1 font-semibold text-foreground text-lg tabular-nums">
                {tier.priceUsd === 0 ? "Free" : `$${tier.priceUsd}`}
                {tier.priceUsd ? (
                  <span className="text-muted-foreground text-xs">/mo</span>
                ) : null}
              </div>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {tier.tagline}
              </p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {tier.features.map((f) => (
                  <li
                    className="flex items-start gap-1.5 text-muted-foreground text-xs"
                    key={f}
                  >
                    <CheckIcon className="mt-0.5 size-3 shrink-0 text-foreground/50" />
                    {f}
                  </li>
                ))}
              </ul>
              {tier.id !== "free" &&
                renderPlanButton({
                  tierId: tier.id,
                  current,
                  subscribable: Boolean(
                    data?.subscribableTiers?.includes(tier.id)
                  ),
                  busy,
                  blockedByTerms: Boolean(needsTerms && !terms),
                  onSubscribe: () => subscribe(tier.id),
                })}
            </div>
          );
        })}
      </div>
    </Overlay>
  );
}

function renderPlanButton({
  current,
  subscribable,
  busy,
  blockedByTerms,
  onSubscribe,
}: {
  tierId: string;
  current: boolean;
  subscribable: boolean;
  busy: boolean;
  blockedByTerms: boolean;
  onSubscribe: () => void;
}) {
  if (current) {
    return (
      <Button
        className="mt-3"
        disabled
        size="sm"
        type="button"
        variant="outline"
      >
        Current plan
      </Button>
    );
  }
  if (!subscribable) {
    return (
      <Button
        className="mt-3"
        disabled
        size="sm"
        type="button"
        variant="outline"
      >
        Coming soon
      </Button>
    );
  }
  return (
    <Button
      className="mt-3"
      disabled={busy || blockedByTerms}
      onClick={onSubscribe}
      size="sm"
      type="button"
      variant="default"
    >
      Subscribe
    </Button>
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
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
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
