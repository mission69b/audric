"use client";

/**
 * SidebarUserNav — wallet-bound footer for AppSidebar.
 *
 * [S.203 — 2026-05-20] Rewritten from NextAuth-style email nav to
 * zkLogin-aware wallet nav. The template shipped this component
 * coupled to next-auth's `user.email`; Audric uses zkLogin where
 * identity is the Sui address (derived from Google OIDC sub + Enoki).
 *
 * Why the rewrite (not a new file):
 *   - This was the SINGLE consumer of `SidebarUserNav` (only AppSidebar
 *     imported it). Replacing in-place removes a layer of indirection
 *     vs adding an `AudricSidebarUserNav` sibling.
 *   - The user-feedback principle from S.203 ("don't reinvent") applies
 *     here too — the template's shadcn primitive set (SidebarMenuButton,
 *     DropdownMenu, etc.) is correct; only the IDENTITY SOURCE needed to
 *     change.
 *   - AppSidebar's footer becomes `<SidebarUserNav />` (no prop). The
 *     component reads `useZkLogin()` directly.
 *
 * Identity display:
 *   - Primary label: truncated wallet address (font-mono, the canonical
 *     Audric identifier).
 *   - Avatar gradient: hashed from email (preserves the deterministic
 *     per-user color from the template — same gradient across sessions).
 *   - Dropdown reveals the email (disabled — read-only) above the
 *     Sign out item, for cases where the user wants to confirm they're
 *     signed in as the right Google account before signing out.
 *
 * Sign-out:
 *   - `useZkLogin().logout` clears `t2000:zklogin:session` from
 *     localStorage + `t2000:zklogin:pending` from sessionStorage +
 *     navigates to "/" (the marketing root, which redirects to /chat
 *     for re-auth). Same net behavior as the legacy `signOutAudric`
 *     call site; we use `useZkLogin` for consistency with the rest of
 *     `/chat/audric-chat-client.tsx`.
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

  // Render nothing until the zkLogin session hydrates. The sidebar
  // footer is purely identity-display — there's no skeleton state to
  // animate. The wider `AppSidebar` lays out around an absent footer
  // (SidebarRail + SidebarContent fill the gap) so this conditional
  // doesn't shift the layout.
  if (!(session && address)) {
    return null;
  }

  const email = decodeJwtClaim(session.jwt, "email");
  const hue = email ? emailToHue(email) : 220;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="h-8 rounded-lg bg-transparent px-2 text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              data-testid="user-nav-button"
              tooltip={truncateAddress(address)}
            >
              <div
                className="size-5 shrink-0 rounded-full ring-1 ring-sidebar-border/50"
                style={{
                  background: `linear-gradient(135deg, oklch(0.35 0.08 ${hue}), oklch(0.25 0.05 ${hue + 40}))`,
                }}
              />
              <span
                className="truncate font-mono text-[12px]"
                data-testid="user-wallet-address"
              >
                {truncateAddress(address)}
              </span>
              <ChevronUp className="ml-auto size-3.5 text-sidebar-foreground/50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width) rounded-lg border border-border/60 bg-card/95 shadow-[var(--shadow-float)] backdrop-blur-xl"
            data-testid="user-nav-menu"
            side="top"
          >
            {email && (
              <DropdownMenuItem
                className="cursor-default text-[12px] text-muted-foreground"
                disabled
              >
                {email}
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
