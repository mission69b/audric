"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/utils";
import { PricingView } from "./pricing-view";

/**
 * The single pricing surface (SPEC_AUDRIC_CONVERSION §1b). A FULL-SCREEN overlay
 * rendering the shared <PricingView> — every upgrade entry point (locked model,
 * out-of-credit banner/card, header plan badge, sidebar) opens this; the
 * standalone `/pricing` route was removed. Call `useUpgradeModal().openUpgrade()`.
 */
type UpgradeModalContextValue = { openUpgrade: () => void };

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(
  null
);

export function useUpgradeModal(): UpgradeModalContextValue {
  const ctx = useContext(UpgradeModalContext);
  if (!ctx) {
    throw new Error(
      "useUpgradeModal must be used within <UpgradeModalProvider>"
    );
  }
  return ctx;
}

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ openUpgrade: () => setOpen(true) }), []);

  // The signed-in user's current plan — only fetched once the overlay opens
  // (anon → 401 → undefined → default checkout CTAs). Drives the "Current plan"
  // state so a subscriber can't re-checkout the plan they already have.
  const { data: credit } = useSWR<{ tier?: string }>(
    open ? "/api/credit/balance" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      <DialogPrimitive.Root onOpenChange={setOpen} open={open}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 duration-100 supports-backdrop-filter:backdrop-blur-xs data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
          <DialogPrimitive.Content className="fixed inset-0 z-50 overflow-y-auto bg-background outline-none duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-2">
            <DialogPrimitive.Title className="sr-only">
              Upgrade Audric
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Choose a plan to unlock every premium model with monthly credit.
            </DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <button
                aria-label="Close"
                className="fixed top-4 right-4 z-10 inline-flex size-9 items-center justify-center rounded-full border border-border/50 bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                type="button"
              >
                <XIcon className="size-4" />
              </button>
            </DialogPrimitive.Close>
            <div className="px-5 py-12">
              <PricingView
                currentTier={credit?.tier}
                onCtaClick={() => setOpen(false)}
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </UpgradeModalContext.Provider>
  );
}
