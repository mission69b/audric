"use client";

/**
 * SidebarUserNav — wallet-bound footer for AppSidebar.
 *
 * [S.203 — 2026-05-20] Rewritten from NextAuth-style email nav to
 * zkLogin-aware wallet nav. The template shipped this component
 * coupled to next-auth's `user.email`; Audric uses zkLogin where
 * identity is the Sui address (derived from Google OIDC sub + Enoki).
 *
 * [S.204+ Phase 6.7 — 2026-05-20] Identity display upgraded to prefer
 * the claimed Audric handle (`alice@audric`) over the raw wallet
 * address. Falls back to truncated address when the handle hasn't been
 * claimed yet — matches v1's `AppSidebar` footer behavior exactly.
 * Source: `useUserStatus()` hook (SWR-cached, 5min dedup).
 *
 * Identity display rules (priority order):
 *   1. `username@audric` (claimed Audric handle) — primary text
 *   2. truncated wallet address (pre-claim users) — primary text
 *   - Email shown as SECONDARY line below the primary (post-claim).
 *   - Email shown inside the dropdown only (pre-claim) — sidebar isn't
 *     where the user reads their email day-to-day.
 *
 * Avatar gradient: hashed from email (preserves deterministic per-user
 * color from the template — same gradient across sessions).
 *
 * Sign-out: `useZkLogin().logout` clears the localStorage session and
 * hard-navigates to "/" (the marketing homepage, which owns sign-in).
 * The now-unauthenticated user stays on `/` (only AUTHENTICATED homepage
 * visitors are redirected to /chat).
 */

import { ChevronUp, LogOut, RefreshCw, Settings, User } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";
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
import { usePortfolio } from "@/hooks/use-portfolio";
import { useUserStatus } from "@/hooks/use-user-status";
import { decodeJwtClaim } from "@/lib/jwt-client";

function truncateAddress(address: string): string {
  if (address.length <= 14) {
    return address;
  }
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function emailToHue(email: string): number {
  let hash = 0;
  for (const char of email) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function fmtTotalUsd(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export function SidebarUserNav() {
  const { session, address, logout } = useZkLogin();
  const { username } = useUserStatus(address, session?.jwt);
  // Shares the `portfolio:${address}` SWR key with EmptyState — the
  // balance peek + connection signal are free (deduped) when the user
  // is on the empty chat. `mutate` powers the offline "Retry" affordance.
  const {
    data: portfolio,
    error: portfolioError,
    mutate: refreshPortfolio,
  } = usePortfolio(address);
  const { theme, setTheme } = useTheme();
  // next-themes resolves the active theme only on the client; gate the
  // segment's pressed state behind mount so the first client render
  // matches the server (no hydration mismatch on the theme toggles).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Render nothing until the zkLogin session hydrates. The sidebar
  // footer is purely identity-display — there's no skeleton state to
  // animate. The wider AppSidebar lays out around an absent footer
  // (SidebarRail + SidebarContent fill the gap) so this conditional
  // doesn't shift the layout.
  if (!(session && address)) {
    return null;
  }

  const email = decodeJwtClaim(session.jwt, "email");
  const hue = email ? emailToHue(email) : 220;

  // S.204+ — prefer Audric handle when claimed. The `@audric` suffix
  // matches v1's footer convention and disambiguates from
  // `username.audric.sui` (which is the on-chain form; this is the
  // user-facing short form per S.118 SuiNS V2).
  const primaryLabel = username
    ? `${username}@audric`
    : truncateAddress(address);
  // Tooltip uses the full address — clicking opens the dropdown, but
  // the address is the canonical identifier worth surfacing on hover.
  const tooltipLabel = username
    ? `${username}@audric · ${truncateAddress(address)}`
    : truncateAddress(address);

  // Connection signal: portfolio fetch health is our proxy for "agent
  // data is live". Error → amber Reconnecting (+ Retry); data → cyan
  // connected; otherwise the first fetch is still in flight.
  const isOffline = Boolean(portfolioError);
  const activeTheme = mounted ? (theme ?? "system") : null;
  const avatarGradient = `linear-gradient(135deg, oklch(0.35 0.08 ${hue}), oklch(0.25 0.05 ${hue + 40}))`;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="h-9 rounded-lg bg-transparent px-2 text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              data-testid="user-nav-button"
              tooltip={tooltipLabel}
            >
              <div
                className="size-6 shrink-0 rounded-full ring-1 ring-sidebar-border/50"
                style={{ background: avatarGradient }}
              />
              <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                <span
                  className="truncate font-mono text-[12px]"
                  data-testid="user-wallet-address"
                >
                  {primaryLabel}
                </span>
                {username && email && (
                  <span className="truncate text-[10px] text-sidebar-foreground/50">
                    {email}
                  </span>
                )}
              </div>
              <ChevronUp className="ml-auto size-3.5 shrink-0 text-sidebar-foreground/50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <AccountMenuContent
            activeTheme={activeTheme}
            avatarGradient={avatarGradient}
            email={email}
            isOffline={isOffline}
            onRetry={() => {
              refreshPortfolio();
            }}
            onSignOut={logout}
            onTheme={setTheme}
            primaryLabel={primaryLabel}
            totalBalance={portfolio ? portfolio.netWorthUsd : null}
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export interface AccountMenuContentProps {
  /** Active theme value; `null` until mounted (avoids hydration mismatch). */
  activeTheme: string | null;
  avatarGradient: string;
  email: string | null;
  isOffline: boolean;
  onRetry: () => void;
  onSignOut: () => void;
  onTheme: (value: string) => void;
  primaryLabel: string;
  /** Net-worth USD; `null` renders the "— —" placeholder (loading / offline). */
  totalBalance: number | null;
}

/**
 * Presentational account menu (R6.5 5a — `phase2-account-dropdown.html`).
 * Pure props in, no hooks — so it renders in the `/dev/account-dropdown`
 * harness for screenshot-diff. Must be mounted inside a `<DropdownMenu>`
 * (it returns a `<DropdownMenuContent>`).
 */
export function AccountMenuContent({
  primaryLabel,
  email,
  avatarGradient,
  totalBalance,
  isOffline,
  activeTheme,
  onTheme,
  onRetry,
  onSignOut,
}: AccountMenuContentProps) {
  return (
    <DropdownMenuContent
      className="w-(--radix-popper-anchor-width) min-w-60 overflow-hidden rounded-lg border border-border/60 bg-card/95 p-1 shadow-[var(--shadow-float)] backdrop-blur-xl"
      data-testid="user-nav-menu"
      side="top"
    >
      {/* Identity block — avatar + handle + email + connection pill */}
      <div className="-mx-1 -mt-1 mb-1 grid grid-cols-[36px_1fr] gap-3 rounded-t-lg border-border/60 border-b bg-muted px-3 py-3">
        <div
          className="size-9 shrink-0 rounded-full ring-1 ring-border/60"
          style={{ background: avatarGradient }}
        />
        <div className="min-w-0">
          <div className="truncate font-medium font-sans text-[14px] text-foreground tracking-[-0.011em]">
            {primaryLabel}
          </div>
          {email && (
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {email}
            </div>
          )}
          <span
            className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.08em] ${
              isOffline
                ? "border-warning/25 bg-warning/10 text-warning"
                : "border-signal/25 bg-signal/10 text-signal"
            }`}
          >
            <span
              className={`size-[5px] rounded-full ${isOffline ? "bg-warning" : "bg-signal"}`}
            />
            {isOffline ? "Reconnecting" : "t2000 connected"}
          </span>
        </div>
      </div>

      {/* Balance peek */}
      <div className="-mx-1 mb-1 flex items-baseline justify-between border-border/60 border-b px-4 py-3">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
          Total balance
        </span>
        <span
          className={`font-medium font-mono text-[16px] tabular-nums tracking-[-0.014em] ${
            totalBalance === null ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {totalBalance === null ? "— —" : fmtTotalUsd(totalBalance)}
        </span>
      </div>

      {/* Account actions */}
      {isOffline && (
        <DropdownMenuItem
          className="cursor-pointer gap-2.5 text-[13px]"
          onSelect={(e) => {
            e.preventDefault();
            onRetry();
          }}
        >
          <RefreshCw className="size-3.5 text-muted-foreground" />
          Retry connection
        </DropdownMenuItem>
      )}
      <DropdownMenuItem asChild data-testid="user-nav-item-passport">
        <Link
          className="w-full cursor-pointer gap-2.5 text-[13px]"
          href="/settings/passport"
        >
          <User className="size-3.5 text-muted-foreground" />
          Passport
        </Link>
      </DropdownMenuItem>
      {/* [S.209] Settings is the single entry point for the
          Passport / Safety / Memory sub-nav. */}
      <DropdownMenuItem asChild data-testid="user-nav-item-settings">
        <Link
          className="w-full cursor-pointer gap-2.5 text-[13px]"
          href="/settings"
        >
          <Settings className="size-3.5 text-muted-foreground" />
          Settings
        </Link>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* Theme — inline segmented control. Plain buttons (not menu
          items) so selecting a theme doesn't close the menu. */}
      <div className="px-2 pt-1 pb-0.5 font-mono text-[9.5px] text-muted-foreground uppercase tracking-[0.08em]">
        Theme
      </div>
      <div className="mx-1 mb-1 flex rounded-md border border-border/60 bg-muted p-0.5">
        {THEME_OPTIONS.map((opt) => {
          const pressed = activeTheme === opt.value;
          return (
            <button
              aria-pressed={pressed}
              className={`flex-1 rounded px-2 py-[5px] font-mono text-[10.5px] tracking-[0.04em] transition-colors ${
                pressed
                  ? "border border-border/60 bg-background text-foreground"
                  : "border border-transparent text-muted-foreground hover:text-foreground"
              }`}
              key={opt.value}
              onClick={() => onTheme(opt.value)}
              type="button"
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        className="cursor-pointer gap-2.5 text-[13px] text-destructive focus:bg-destructive/10 focus:text-destructive"
        data-testid="user-nav-item-auth"
        onSelect={onSignOut}
      >
        <LogOut className="size-3.5" />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
