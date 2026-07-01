"use client";

import {
  CoinsIcon,
  LockIcon,
  PanelLeftIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import useSWR from "swr";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import { useUpgradeModal } from "@/components/pricing/upgrade-modal";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetcher } from "@/lib/utils";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

/** Plan pill (Perplexity-style, top-left) — free users see "Free plan · Upgrade",
 * subscribers see their tier; both open the pricing overlay (manage billing via
 * the sidebar user menu). Authed-only. */
function PlanBadge() {
  const { openUpgrade } = useUpgradeModal();
  const { status } = useZkLogin();
  const { data } = useSWR<{ tier?: string; configured: boolean }>(
    status === "authenticated" ? "/api/credit/balance" : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  if (status !== "authenticated") {
    return null;
  }
  const paidTier = data?.tier && data.tier !== "free" ? data.tier : null;

  if (paidTier) {
    return (
      <button
        className="rounded-full border border-border/50 px-2.5 py-1 text-[12px] text-muted-foreground capitalize transition-colors hover:bg-accent hover:text-foreground"
        onClick={openUpgrade}
        type="button"
      >
        {paidTier} plan
      </button>
    );
  }
  return (
    <button
      className="flex items-center gap-1.5 rounded-full border border-border/50 px-2.5 py-1 text-[12px] transition-colors hover:bg-accent"
      onClick={openUpgrade}
      type="button"
    >
      <span className="text-muted-foreground">Free plan</span>
      <span className="font-medium text-foreground">Upgrade</span>
    </button>
  );
}

/** Credits/plan popover (top-right, Perplexity-style) — a compact affordance that
 * shows the available credit + plan and routes to the pricing overlay. Replaces the
 * invasive above-composer upgrade nudge (the plan is also on the top-left pill). */
function CreditsMenu() {
  const { openUpgrade } = useUpgradeModal();
  const { status } = useZkLogin();
  const { data } = useSWR<{
    tier?: string;
    balanceUsd?: number | null;
    configured: boolean;
  }>(status === "authenticated" ? "/api/credit/balance" : null, fetcher, {
    revalidateOnFocus: false,
  });
  if (status !== "authenticated" || !data?.configured) {
    return null;
  }
  const tier = data.tier ?? "free";
  const isFree = tier === "free";
  const balance = data.balanceUsd ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Credits and plan"
          className="flex items-center gap-1.5 rounded-full border border-border/40 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          type="button"
        >
          <CoinsIcon className="size-3.5" />
          <span className="hidden tabular-nums sm:inline">
            ${balance.toFixed(2)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 rounded-2xl p-3"
        sideOffset={8}
      >
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium capitalize">{tier}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Available credit</span>
          <span className="font-medium tabular-nums">
            ${balance.toFixed(2)}
          </span>
        </div>
        <div className="mt-3 rounded-xl border border-border/50 bg-muted/30 p-2.5">
          <p className="text-[12px] text-muted-foreground">
            {isFree
              ? "Unlock every frontier model + a monthly credit that never expires."
              : "Change plan or top up your monthly credit anytime."}
          </p>
          <Button
            className="mt-2 h-7 w-full rounded-lg text-[12px]"
            onClick={openUpgrade}
            size="sm"
          >
            {isFree ? "Upgrade plan" : "Manage plan"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Privacy indicator (top-right) — Audric is private by default (ZDR), so this is
 * an informational badge (not a toggle like Perplexity's incognito). Reinforces
 * the core differentiator on every screen. */
function PrivacyBadge() {
  // Controlled so it's tap-openable on touch (Radix tooltips are hover/focus-only
  // and never open on mobile tap) while keeping desktop hover via onOpenChange.
  const [open, setOpen] = useState(false);
  // Reflect the composer's Confidential toggle (localStorage + a custom event the
  // toggle dispatches — same-tab localStorage writes don't fire `storage`).
  const [confidential, setConfidential] = useState(false);
  useEffect(() => {
    const read = () =>
      setConfidential(
        window.localStorage.getItem("audric-confidential") === "1"
      );
    read();
    window.addEventListener("audric-confidential-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("audric-confidential-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip onOpenChange={setOpen} open={open}>
        <TooltipTrigger asChild>
          <button
            aria-label="Privacy details"
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] text-muted-foreground ${
              confidential ? "border-emerald-500/40" : "border-border/40"
            }`}
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            {confidential ? (
              <LockIcon className="size-3.5 text-emerald-500" />
            ) : (
              <ShieldCheckIcon className="size-3.5 text-emerald-500" />
            )}
            <span className="hidden sm:inline">
              {confidential ? "Confidential" : "Private"}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {confidential ? "Confidential · TEE" : "Private · ZDR"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { state, toggleSidebar, isMobile } = useSidebar();

  if (state === "collapsed" && !isMobile) {
    return null;
  }

  return (
    <header className="sticky top-0 flex h-14 items-center gap-2 bg-sidebar px-3">
      <Button
        className="md:hidden"
        onClick={toggleSidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      <PlanBadge />

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <div className="ml-auto flex items-center gap-2">
        <CreditsMenu />
        <PrivacyBadge />
      </div>
    </header>
  );
}

export const ChatHeader = memo(
  PureChatHeader,
  (prevProps, nextProps) =>
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
);
