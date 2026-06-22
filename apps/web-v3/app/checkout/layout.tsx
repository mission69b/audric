import type { ReactNode } from "react";
import { FounderFloatingButton } from "@/components/chat/founder-floating-button";

/**
 * Checkout layout — mounts the founder "Book 15 min" pill across /checkout +
 * /checkout/return (the Zinc-style founder overlay at the high-intent moment).
 */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <FounderFloatingButton />
    </>
  );
}
