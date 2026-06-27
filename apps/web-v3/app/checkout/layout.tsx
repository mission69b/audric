import type { ReactNode } from "react";
import { FounderFloatingButton } from "@/components/chat/founder-floating-button";
import { ThemeProvider } from "@/components/theme-provider";

/**
 * Checkout layout — mounts the founder "Book 15 min" pill across /checkout +
 * /checkout/return (the Zinc-style founder overlay at the high-intent moment).
 *
 * Forced LIGHT theme: Stripe's embedded checkout has a fixed light chrome, so a
 * dark app shell around it clashes; Perplexity (and most) default checkout to
 * light. forcedTheme also flows to `useTheme().resolvedTheme` → the page sends
 * "light" to the Stripe session appearance.
 */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="light">
      {children}
      <FounderFloatingButton />
    </ThemeProvider>
  );
}
