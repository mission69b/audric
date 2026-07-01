"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TIERS } from "@/lib/credit/tiers";
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
  const { mutate } = useSWRConfig();

  // Existing-subscriber plan change (proration handled server-side). Confirm
  // first (it's money), then POST the change + refresh the plan + close.
  const [changing, setChanging] = useState<{
    tier: string;
    label: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The exact proration Stripe would charge/credit now (fetched when the confirm
  // opens for a paid switch) — so the dialog shows a real number, not just "prorated".
  const [preview, setPreview] = useState<{
    amountDueCents: number;
    currency: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  useEffect(() => {
    if (!changing || changing.tier === "free") {
      setPreview(null);
      return;
    }
    let alive = true;
    setPreview(null);
    setPreviewLoading(true);
    fetch(`/api/billing/subscription?tier=${encodeURIComponent(changing.tier)}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive) {
          setPreview(j.preview ?? null);
        }
      })
      .catch(() => {
        /* fall back to the generic note */
      })
      .finally(() => {
        if (alive) {
          setPreviewLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [changing]);

  const changeMessage =
    changing?.tier === "free"
      ? "Your current plan stays active until the end of your billing period, then switches to Free — no further charges."
      : changing?.label.startsWith("Upgrade")
        ? "Your new plan takes effect immediately."
        : "You'll switch now, prorated to your next invoice.";
  const amountLine = (() => {
    if (!changing || changing.tier === "free") {
      return null;
    }
    if (previewLoading) {
      return "Calculating the exact amount…";
    }
    if (!preview) {
      return null;
    }
    const dollars = `$${(Math.abs(preview.amountDueCents) / 100).toFixed(2)}`;
    if (preview.amountDueCents > 0) {
      return `You'll be charged about ${dollars} now (prorated for the rest of this cycle).`;
    }
    if (preview.amountDueCents < 0) {
      return `You'll be credited about ${dollars} toward your next invoice.`;
    }
    return "No charge now — prorated to your next invoice.";
  })();
  // Go-forward recurring price (the full monthly rate from the next cycle on) — so
  // the confirm reads as a real breakdown, not just the one-off prorated amount.
  const recurringLine = (() => {
    if (!changing || changing.tier === "free") {
      return null;
    }
    const price = TIERS.find((t) => t.id === changing.tier)?.priceUsd;
    return price ? `Then $${price}/mo from your next billing cycle.` : null;
  })();

  const confirmChange = async () => {
    if (!changing) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change", tier: changing.tier }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        await mutate("/api/credit/balance");
        toast.success(
          changing.tier === "free"
            ? "Your plan will switch to Free at the end of your billing period."
            : "Your plan has been updated."
        );
        setChanging(null);
        setOpen(false);
      } else {
        toast.error(json.error ?? "Couldn't change your plan.");
      }
    } catch {
      toast.error("Couldn't change your plan.");
    } finally {
      setSubmitting(false);
    }
  };

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
                onChangePlan={(tier, label) => setChanging({ tier, label })}
                onCtaClick={() => setOpen(false)}
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <AlertDialog
        onOpenChange={(o) => !o && setChanging(null)}
        open={changing !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{changing?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              {changeMessage}
              {amountLine ? (
                <span className="mt-2 block font-medium text-foreground">
                  {amountLine}
                </span>
              ) : null}
              {recurringLine ? (
                <span className="mt-1 block text-muted-foreground">
                  {recurringLine}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault();
                confirmChange();
              }}
            >
              {submitting ? "Updating…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UpgradeModalContext.Provider>
  );
}
