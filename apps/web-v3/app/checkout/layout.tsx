import type { ReactNode } from "react";
import { FounderFloatingButton } from "@/components/chat/founder-floating-button";
import { ForceLightTheme } from "@/components/force-light-theme";

/**
 * Checkout layout — mounts the founder "Book 15 min" pill across /checkout +
 * /checkout/return (the Zinc-style founder overlay at the high-intent moment).
 *
 * Forced LIGHT: Stripe's embedded checkout has fixed light chrome, so a dark app
 * shell around it clashes (Perplexity defaults checkout to light). ForceLightTheme
 * drops the `dark` class from <html> for this route (the page hard-sets the Stripe
 * appearance to "light" too — see checkout/page.tsx).
 */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
      <FounderFloatingButton />
    </>
  );
}
