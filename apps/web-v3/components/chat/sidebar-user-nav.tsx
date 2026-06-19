"use client";

import { ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import useSWR from "swr";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { fetcher } from "@/lib/utils";
import { LoaderIcon } from "./icons";

/** Floor to 2dp — never overstate a balance (financial-amounts rule). */
function fmtUsdc(usdc: number | null | undefined): string {
  if (usdc == null) {
    return "—";
  }
  return `$${(Math.floor(usdc * 100) / 100).toFixed(2)}`;
}

function addrHue(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function SidebarUserNav() {
  const { status, address, email, login, logout } = useZkLogin();
  const { setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const { data: balance } = useSWR<{ usdc: number | null }>(
    status === "authenticated" ? "/api/wallet/balance" : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: credit } = useSWR<{
    balanceUsd: number | null;
    configured: boolean;
    tier?: string;
  }>(status === "authenticated" ? "/api/credit/balance" : null, fetcher, {
    revalidateOnFocus: false,
  });
  const { data: identity } = useSWR<{ handle: string | null }>(
    status === "authenticated" ? "/api/identity/me" : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const paidTier = credit?.tier && credit.tier !== "free" ? credit.tier : null;

  if (status === "loading") {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton className="h-8 justify-between rounded-lg bg-transparent text-sidebar-foreground/50">
            <span className="animate-pulse rounded-md bg-sidebar-foreground/10 text-[13px] text-transparent">
              Loading…
            </span>
            <div className="animate-spin text-sidebar-foreground/50">
              <LoaderIcon />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // Anonymous (try-before-signup) — a Log in button drives the Google flow.
  if (status !== "authenticated" || !address) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            className="h-8 rounded-lg bg-sidebar-accent px-2 text-[13px] text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent/80"
            data-testid="login-button"
            onClick={() => login()}
          >
            Log in
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="h-auto rounded-lg bg-transparent px-2 py-1.5 text-sidebar-foreground/70 transition-colors group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!p-0 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              data-testid="user-nav-button"
            >
              <div
                className="size-7 shrink-0 rounded-full ring-1 ring-sidebar-border/50"
                style={{
                  background: `linear-gradient(135deg, oklch(0.35 0.08 ${addrHue(address)}), oklch(0.25 0.05 ${addrHue(address) + 40}))`,
                }}
              />
              <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
                <span
                  className="truncate font-mono text-[12px] text-sidebar-foreground/80"
                  data-testid="user-address"
                >
                  {identity?.handle ?? shortAddress(address)}
                </span>
                {email && (
                  <span className="truncate text-[11px] text-sidebar-foreground/45">
                    {email}
                  </span>
                )}
              </div>
              <ChevronUp className="ml-auto size-3.5 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width) rounded-lg border border-border/60 bg-card/95 shadow-[var(--shadow-float)] backdrop-blur-xl"
            data-testid="user-nav-menu"
            side="top"
          >
            {/* Ambient two-rail readout (§5c) — credit (Phase 5) + Passport
                USDC (Phase 4). Never a balance dashboard (anti-bloat, S.432). */}
            <div
              className="px-2 py-1.5 text-[12px]"
              data-testid="funding-readout"
            >
              {/* One adaptive status line — Plan for subscribers, else Credits
                  for the PAYG-primary path. Never both (the full breakdown lives
                  in Billing). */}
              {paidTier ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Plan</span>
                  <span className="font-medium text-foreground/80 capitalize">
                    {paidTier}
                  </span>
                </div>
              ) : credit?.configured ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Credits</span>
                  <span className="text-foreground/70 tabular-nums">
                    {fmtUsdc(credit?.balanceUsd)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Passport USDC</span>
                <span className="text-foreground/70 tabular-nums">
                  {fmtUsdc(balance?.usdc)}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-[13px]"
              data-testid="user-nav-item-settings"
              onSelect={() => router.push("/settings")}
            >
              Settings
            </DropdownMenuItem>
            {credit?.configured && (
              <DropdownMenuItem
                className="cursor-pointer text-[13px]"
                data-testid="user-nav-item-billing"
                onSelect={() => router.push("/settings/billing")}
              >
                Top up · Billing
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-[13px]"
              data-testid="user-nav-item-theme"
              onSelect={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {`Toggle ${resolvedTheme === "light" ? "dark" : "light"} mode`}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild data-testid="user-nav-item-auth">
              <button
                className="w-full cursor-pointer text-[13px] text-red-500"
                onClick={() => logout()}
                type="button"
              >
                Sign out
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
