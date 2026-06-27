import { PricingPlans } from "./pricing-plans";

/**
 * The shared pricing BODY (header + plans), rendered identically by the
 * `/pricing` route AND the in-app full-screen upgrade overlay — so there's one
 * pricing surface, two entry points (SPEC_AUDRIC_CONVERSION §1a/§1b). Each
 * context supplies its own chrome (the page adds a back-link + footer; the
 * overlay adds a close button). `onCtaClick` lets the overlay close on navigate.
 */
export function PricingView({ onCtaClick }: { onCtaClick?: () => void }) {
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
        <PricingPlans onCtaClick={onCtaClick} />
      </div>
    </div>
  );
}
