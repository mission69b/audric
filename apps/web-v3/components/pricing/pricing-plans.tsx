import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { COMING_SOON, EVERY_PLAN, TIERS } from "@/lib/credit/tiers";
import { cn } from "@/lib/utils";

type PlanCta =
  | { kind: "current"; label: string }
  | { kind: "link"; label: string; href: string };

/**
 * Resolve a tier's CTA given the user's CURRENT plan. Prevents the "re-checkout
 * the plan you already have" bug: the active tier shows a non-clickable "Current
 * plan", and an existing subscriber switching tiers is routed to Billing (the
 * Stripe-managed change flow) rather than a fresh `/checkout` that double-charges.
 */
function planCta(
  tierId: string,
  priceUsd: number | null,
  tierName: string,
  currentTier?: string
): PlanCta {
  if (currentTier && tierId === currentTier) {
    return { kind: "current", label: "Current plan" };
  }
  // Existing PAID subscriber changing plans → manage via Billing, not a new checkout.
  if (currentTier && currentTier !== "free" && tierId !== currentTier) {
    return { kind: "link", label: "Manage plan", href: "/settings/billing" };
  }
  if (!priceUsd) {
    return { kind: "link", label: "Start free", href: "/" };
  }
  return {
    kind: "link",
    label: `Get ${tierName}`,
    href: `/checkout?plan=${tierId}`,
  };
}

/**
 * The single source of plan UI (SPEC_AUDRIC_CONVERSION §1a), rendered via
 * <PricingView> inside the in-app full-screen upgrade overlay. Presentational +
 * server-compatible (no hooks) — CTAs are plain links to the existing
 * `/checkout?plan=` flow. `onCtaClick` lets the overlay close itself on navigate.
 * `currentTier` (the signed-in user's active plan) gates the per-tier CTA.
 */
export function PricingPlans({
  onCtaClick,
  currentTier,
}: {
  onCtaClick?: () => void;
  currentTier?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/50 bg-card/40 p-6">
        <h2 className="font-medium text-foreground text-sm">
          Included in every plan — Free included
        </h2>
        <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {EVERY_PLAN.map((f) => (
            <li
              className="flex items-start gap-2 text-muted-foreground text-sm"
              key={f}
            >
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-teal-500/70" />
              {f}
            </li>
          ))}
        </ul>
        <Link
          className="mt-4 inline-block text-foreground text-sm underline underline-offset-4 transition-colors hover:text-muted-foreground"
          href="/skills"
        >
          Browse all Skills →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const featured = tier.id === "pro";
          return (
            <div
              className={cn(
                "flex flex-col rounded-2xl border p-6",
                featured
                  ? "border-teal-500/40 bg-teal-500/[0.04] shadow-[var(--shadow-card)]"
                  : "border-border/50 bg-card/30"
              )}
              key={tier.id}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-lg">
                  {tier.name}
                </h3>
                {featured && (
                  <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] text-teal-600 uppercase tracking-wide dark:text-teal-400">
                    Popular
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                {tier.originalPriceUsd ? (
                  <span className="text-muted-foreground/50 line-through tabular-nums">
                    ${tier.originalPriceUsd}
                  </span>
                ) : null}
                <span className="font-semibold text-3xl text-foreground tabular-nums">
                  {tier.priceUsd === 0 ? "Free" : `$${tier.priceUsd}`}
                </span>
                {tier.priceUsd ? (
                  <span className="text-muted-foreground text-sm">/mo</span>
                ) : null}
              </div>
              {tier.originalPriceUsd ? (
                <span className="mt-2 inline-block self-start rounded bg-teal-500/10 px-1.5 py-0.5 font-medium text-[11px] text-teal-600 dark:text-teal-400">
                  Beta · 50% off
                </span>
              ) : null}
              <p className="mt-2 text-muted-foreground text-sm">
                {tier.tagline}
              </p>

              <ul className="mt-5 flex-1 space-y-2">
                {tier.features.map((f) => (
                  <li
                    className="flex items-start gap-2 text-muted-foreground text-sm"
                    key={f}
                  >
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-teal-500/70" />
                    {f}
                  </li>
                ))}
              </ul>

              {(() => {
                const cta = planCta(
                  tier.id,
                  tier.priceUsd,
                  tier.name,
                  currentTier
                );
                if (cta.kind === "current") {
                  return (
                    <span
                      aria-disabled="true"
                      className="mt-6 inline-flex h-9 cursor-default items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-4 font-medium text-muted-foreground text-sm"
                    >
                      <CheckIcon className="size-4 text-teal-500/80" />
                      {cta.label}
                    </span>
                  );
                }
                return (
                  <Link
                    className={cn(
                      "mt-6 inline-flex h-9 items-center justify-center rounded-lg px-4 font-medium text-sm transition-colors",
                      featured
                        ? "bg-teal-600 text-white hover:bg-teal-500"
                        : "border border-border/60 text-foreground hover:bg-muted"
                    )}
                    href={cta.href}
                    onClick={onCtaClick}
                  >
                    {cta.label}
                  </Link>
                );
              })()}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/40 border-dashed p-5">
        <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Coming soon
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {COMING_SOON.map((f) => (
            <li className="text-muted-foreground/70 text-sm" key={f}>
              · {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
