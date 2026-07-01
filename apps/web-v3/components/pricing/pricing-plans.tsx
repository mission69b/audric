import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { COMING_SOON, EVERY_PLAN, TIERS } from "@/lib/credit/tiers";
import { cn } from "@/lib/utils";

type PlanCta =
  | { kind: "current"; label: string }
  | { kind: "link"; label: string; href: string }
  | { kind: "change"; label: string; tier: string };

/**
 * Resolve a tier's CTA given the user's CURRENT plan.
 * - Active tier → non-clickable "Current plan" (no re-checkout).
 * - Existing PAID subscriber switching tiers → an in-app CHANGE action
 *   (`subscriptions.update`, Stripe-prorated) — NOT a fresh `/checkout` (which
 *   would create a second subscription + double-charge). Downgrade to Free =
 *   cancel at period end. This is the fix for the old dead "Manage plan → billing"
 *   loop that left subscribers unable to up/downgrade.
 * - New / free user → `/checkout?plan=` (or Start free).
 */
function planCta(
  tierId: string,
  priceUsd: number | null,
  tierName: string,
  currentTier?: string,
  currentPriceUsd?: number | null
): PlanCta {
  if (currentTier && tierId === currentTier) {
    return { kind: "current", label: "Current plan" };
  }
  if (currentTier && currentTier !== "free" && tierId !== currentTier) {
    if (!priceUsd) {
      return { kind: "change", label: "Downgrade to Free", tier: tierId };
    }
    const dir =
      currentPriceUsd != null && priceUsd > currentPriceUsd
        ? "Upgrade to"
        : "Switch to";
    return { kind: "change", label: `${dir} ${tierName}`, tier: tierId };
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
  onChangePlan,
}: {
  onCtaClick?: () => void;
  currentTier?: string;
  // Existing subscriber switching tiers (proration handled server-side). When
  // absent (e.g. static/marketing render), a switch CTA falls back to Billing.
  onChangePlan?: (tier: string, label: string) => void;
}) {
  const currentPriceUsd =
    currentTier == null
      ? null
      : (TIERS.find((t) => t.id === currentTier)?.priceUsd ?? null);
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
                  currentTier,
                  currentPriceUsd
                );
                const ctaClass = cn(
                  "mt-6 inline-flex h-9 items-center justify-center rounded-lg px-4 font-medium text-sm transition-colors",
                  featured
                    ? "bg-teal-600 text-white hover:bg-teal-500"
                    : "border border-border/60 text-foreground hover:bg-muted"
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
                // Existing subscriber switching tiers → in-app change action
                // (falls back to Billing if no handler was provided).
                if (cta.kind === "change") {
                  if (!onChangePlan) {
                    return (
                      <Link className={ctaClass} href="/settings/billing">
                        {cta.label}
                      </Link>
                    );
                  }
                  return (
                    <button
                      className={ctaClass}
                      onClick={() => onChangePlan(cta.tier, cta.label)}
                      type="button"
                    >
                      {cta.label}
                    </button>
                  );
                }
                return (
                  <Link
                    className={ctaClass}
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
