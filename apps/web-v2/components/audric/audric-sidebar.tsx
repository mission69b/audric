"use client";

/**
 * AudricSidebar — the chat surface's chrome (brand mark + New chat +
 * wallet-bound sign-out).
 *
 * Mirrors `components/chat/app-sidebar.tsx`'s shape but is zkLogin-aware
 * instead of NextAuth-aware (the template's `AppSidebar` is scheduled for
 * deletion in Session 9a along with the rest of the `(chat)` route
 * group). This component is the post-cutover sidebar for `/chat`.
 *
 * Identity is sourced from `useZkLogin()` directly — no `user` prop, no
 * server-side `getCurrentUser()` round-trip. The user signed in via
 * Google → Enoki → Sui address; the wallet address (truncated) is the
 * canonical at-a-glance identifier and the sign-out tap clears the
 * zkLogin localStorage blob via `useZkLogin().logout()`.
 *
 * Layout matches the trimmed AppSidebar (S.197a):
 *   - Header: AudricMark (brand) + sidebar collapse toggle
 *   - Content: "New chat" navigation
 *   - Footer: wallet-pill + sign-out dropdown
 *
 * The chip bar + balance hero + composer all live in
 * `audric-chat-client.tsx` (the SidebarInset content), not in this
 * sidebar.
 */

import { ChevronUp, PanelLeftIcon, PenSquareIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { AudricMark } from "@/components/ui/audric-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

export function AudricSidebar() {
  const router = useRouter();
  const { setOpenMobile, toggleSidebar } = useSidebar();
  const { session, address, logout } = useZkLogin();

  const email = session ? decodeJwtClaim(session.jwt, "email") : null;
  const hue = email ? emailToHue(email) : 220;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pb-0 pt-3">
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row items-center justify-between">
            <div className="group/logo relative flex items-center justify-center">
              <SidebarMenuButton
                asChild
                className="size-8 !px-0 items-center justify-center group-data-[collapsible=icon]:group-hover/logo:opacity-0"
                tooltip="Audric"
              >
                <Link href="/chat" onClick={() => setOpenMobile(false)}>
                  <AudricMark
                    className="text-sidebar-foreground/70"
                    size={16}
                  />
                </Link>
              </SidebarMenuButton>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className="pointer-events-none absolute inset-0 size-8 opacity-0 group-data-[collapsible=icon]:pointer-events-auto group-data-[collapsible=icon]:group-hover/logo:opacity-100"
                    onClick={() => toggleSidebar()}
                  >
                    <PanelLeftIcon className="size-4" />
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent className="hidden md:block" side="right">
                  Open sidebar
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <SidebarTrigger className="text-sidebar-foreground/60 transition-colors duration-150 hover:text-sidebar-foreground" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-8 rounded-lg border border-sidebar-border text-[13px] text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  onClick={() => {
                    setOpenMobile(false);
                    router.push("/chat");
                  }}
                  tooltip="New chat"
                >
                  <PenSquareIcon className="size-4" />
                  <span className="font-medium">New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border pt-2 pb-3">
        {address && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    className="h-8 px-2 rounded-lg bg-transparent text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    data-testid="audric-user-nav-button"
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
                      data-testid="audric-wallet-address"
                    >
                      {truncateAddress(address)}
                    </span>
                    <ChevronUp className="ml-auto size-3.5 text-sidebar-foreground/50" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-popper-anchor-width) rounded-lg border border-border/60 bg-card/95 backdrop-blur-xl shadow-[var(--shadow-float)]"
                  data-testid="audric-user-nav-menu"
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
                  <DropdownMenuItem
                    asChild
                    data-testid="audric-user-nav-signout"
                  >
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
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
