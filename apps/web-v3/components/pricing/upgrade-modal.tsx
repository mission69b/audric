"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PricingPlans } from "./pricing-plans";

/**
 * One instant upgrade surface (SPEC_AUDRIC_CONVERSION §1b). Replaces routing to
 * `/pricing` or `/settings/billing` (slow, scroll) — anything that wants to
 * prompt an upgrade calls `useUpgradeModal().openUpgrade()`. Renders the shared
 * <PricingPlans> so the modal + page can never drift.
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

  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[88vh] gap-5 overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Upgrade Audric</DialogTitle>
            <DialogDescription>
              Every premium + frontier model, with monthly credit that never
              expires.
            </DialogDescription>
          </DialogHeader>
          <PricingPlans compact onCtaClick={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </UpgradeModalContext.Provider>
  );
}
