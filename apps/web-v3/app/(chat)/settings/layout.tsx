import type { ReactNode } from "react";
import { FounderFloatingButton } from "@/components/chat/founder-floating-button";

/**
 * Settings area layout — mounts the founder "Book 15 min" floating pill once so
 * it shows across Settings + Billing (the account / money zone), and nowhere
 * else (never in chat). Scoped by living under app/(chat)/settings.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <FounderFloatingButton />
    </>
  );
}
