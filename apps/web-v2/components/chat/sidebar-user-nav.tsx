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
 * Sign-out: `useZkLogin().logout` clears localStorage + sessionStorage
 * and navigates to "/" (marketing root, which redirects to /chat for
 * re-auth).
 */

import { ChevronUp } from "lucide-react";
import { useZkLogin } from "@/components/auth/use-zklogin";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
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

export function SidebarUserNav() {
  const { session, address, logout } = useZkLogin();
  const { username } = useUserStatus(address, session?.jwt);

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
                style={{
                  background: `linear-gradient(135deg, oklch(0.35 0.08 ${hue}), oklch(0.25 0.05 ${hue + 40}))`,
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                <span
                  className={[
                    "truncate text-[12px]",
                    username
                      ? "font-mono text-sidebar-foreground"
                      : "font-mono",
                  ].join(" ")}
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
          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width) rounded-lg border border-border/60 bg-card/95 shadow-[var(--shadow-float)] backdrop-blur-xl"
            data-testid="user-nav-menu"
            side="top"
          >
            {/* Always show email in dropdown — it's the second identity
                dimension (zkLogin auth) regardless of claim status. */}
            {email && (
              <DropdownMenuItem
                className="cursor-default text-[12px] text-muted-foreground"
                disabled
              >
                {email}
              </DropdownMenuItem>
            )}
            {/* For pre-claim users, also surface the address in the
                dropdown — it's their on-chain identifier until they
                claim a handle. Post-claim users get the address in the
                tooltip; the dropdown stays focused on auth identity. */}
            {!username && (
              <DropdownMenuItem
                className="cursor-default font-mono text-[11px] text-muted-foreground"
                disabled
              >
                {truncateAddress(address)}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild data-testid="user-nav-item-auth">
              <button
                className="w-full cursor-pointer text-[13px]"
                onClick={logout}
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
