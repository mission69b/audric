"use client";

/**
 * AppSidebar — chat-first chrome for the /chat surface.
 *
 * [S.208 — 2026-05-20] Rewritten to the **chatbot.ai-sdk.dev template
 * pattern**: brand lockup + New chat + HISTORY + user dropdown. The
 * S.207 version had 7 nav items (Dashboard/Portfolio/Activity/Pay/
 * Contacts/Store/Settings) that pointed at `/coming-soon` stubs — that
 * was a v1 carry-over which fought the template's chat-first design.
 *
 * For v0.7c, the chat IS the app:
 *   - Portfolio / Activity / Pay are reached BY CHATTING ("show my
 *     portfolio", "send 5 USDC", "what did I spend last week") — they
 *     don't need a sidebar nav item.
 *   - Settings + Contacts moved into the bottom-left user dropdown
 *     (SidebarUserNav) so the sidebar stays focused on chat history.
 *   - `/coming-soon` route was deleted — no link points to it anymore.
 *
 * RECENTS (now HISTORY): switched from the custom `<ConvoHistoryList>`
 * (which fetched cross-app from v1's `/api/engine/sessions`) to the
 * template's `<SidebarHistory>` (which hits the v2-native `/api/history`
 * with the JWT-bearing fetcher). The empty-state copy + skeleton loader
 * are the template's. Conversations populate when v0.7d MemWal wires
 * chat persistence into `/api/chat`.
 *
 * Prior history (S.205 / S.207 context — kept for traceability):
 *   - S.205: handleNewChat dispatches `audric:new-chat` so the panel's
 *     useChat re-mounts (router.push to same path is a no-op).
 *   - S.207: added 7 nav items + RECENTS via ConvoHistoryList — those
 *     additions are reverted in this SPEC.
 */

import { PanelLeftIcon, PenSquareIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { SidebarHistory } from "@/components/chat/sidebar-history";
import { SidebarUserNav } from "@/components/chat/sidebar-user-nav";
import { AudricMark } from "@/components/ui/audric-mark";
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
import { dispatchNewChat } from "@/lib/audric/new-chat-event";
import { decodeJwtClaim } from "@/lib/jwt-client";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile, toggleSidebar } = useSidebar();
  const { session, address } = useZkLogin();

  // [S.205] "New chat" handler: dispatch the new-chat signal so
  // AudricChatPanel re-mounts its `useChat()` instance (clears messages,
  // returns to empty state). When the user is somewhere OTHER than
  // /chat, also push to /chat so the button doubles as navigation.
  const handleNewChat = () => {
    setOpenMobile(false);
    dispatchNewChat();
    if (pathname !== "/chat") {
      router.push("/chat");
    }
  };

  // [S.208] Adapt the zkLogin session into the template's
  // AudricSessionUser shape so SidebarHistory's `useSWRInfinite` fires
  // and the JWT-bearing fetcher (`historyFetcher`) attaches the header.
  // When the session hasn't hydrated yet, `user` is undefined and
  // SidebarHistory short-circuits to the "Login to save…" empty state
  // — matches the template's nullable-session contract verbatim.
  const user =
    address && session
      ? {
          id: address,
          email: decodeJwtClaim(session.jwt, "email") ?? null,
          type: "regular" as const,
        }
      : undefined;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pb-0 pt-3">
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row items-center justify-between">
            <div className="group/logo relative flex items-center justify-center">
              <SidebarMenuButton
                asChild
                className="size-8 items-center justify-center !px-0 group-data-[collapsible=icon]:group-hover/logo:opacity-0"
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
            {/* [S.209 — 2026-05-20] BETA badge removed per founder feedback:
                "keep it simple". The brand wordmark alone is enough chrome;
                v0.7c is private beta by deployment context (audric-web-v2
                preview), not by visible badge. */}
            <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
              <span className="font-medium text-[14px] text-sidebar-foreground tracking-[-0.01em]">
                Audric
              </span>
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <SidebarTrigger className="text-sidebar-foreground/60 transition-colors duration-150 hover:text-sidebar-foreground" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* New chat — only nav item the chat-first surface keeps. */}
        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-8 rounded-lg border border-sidebar-border text-[13px] text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  onClick={handleNewChat}
                  tooltip="New chat"
                >
                  <PenSquareIcon className="size-4" />
                  <span className="font-medium">New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* HISTORY — template-native; ships with skeleton loader +
            date-grouped (Today / Yesterday / Last 7d / Last 30d /
            Older) + per-item delete via AlertDialog. Empty until
            v0.7d MemWal writes session persistence into /api/chat. */}
        <SidebarHistory user={user} />
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t pt-2 pb-3">
        <SidebarUserNav />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
