import { PricingPlans } from "./pricing-plans";

/**
 * The shared pricing BODY (header + plans), rendered by the in-app full-screen
 * upgrade overlay (SPEC_AUDRIC_CONVERSION §1b). The standalone `/pricing` route
 * was removed (2026-06-27) — every entry point opens the overlay now, so this is
 * the single pricing surface. `onCtaClick` lets the overlay close on navigate.
 */
export function PricingView({
  onCtaClick,
  currentTier,
  onChangePlan,
}: {
  onCtaClick?: () => void;
  currentTier?: string;
  onChangePlan?: (tier: string, label: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="text-center">
        <h1 className="font-semibold text-3xl text-foreground tracking-tight sm:text-4xl">
          Private AI, priced simply
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Start free — open, uncensored models, a non-custodial wallet, and your
          own data. Upgrade for every frontier model with monthly credit that
          never expires.
        </p>
      </div>
      <div className="mt-10">
        <PricingPlans
          currentTier={currentTier}
          onChangePlan={onChangePlan}
          onCtaClick={onCtaClick}
        />
      </div>
    </div>
  );
}
