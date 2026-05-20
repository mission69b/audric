"use client";

import { PanelLeftIcon, PenSquareIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

// [v0.7c Session 5.5] AppSidebar trimmed to its essential chrome:
//   - Audric mark (brand) at the top
//   - "New chat" navigation (resets the audric-chat surface)
//   - User nav (sign-out) at the bottom
//
// Removed in this session (founder Option A locks):
//   - SidebarHistory + getChatHistoryPaginationKey — chat-history feature
//     was template-default; superseded by MemWal memory recall in v0.7d.
//     The template `/api/history` route + `SidebarHistory` component
//     delete wholesale in Session 9a.
//   - "Delete all chats" button + its AlertDialog — depended on the
//     chat-history feature; redundant once history is hidden.
//   - "Chatbot" tooltip + generic MessageSquareIcon brand mark — replaced
//     with `<AudricMark />` (the 9-cell diamond brand identity).
//
// [S.203 — 2026-05-20] Re-wired as the canonical sidebar for `/chat`
// (the post-S.197b chat-flip surface). Dropped the `user: User | undefined`
// prop in favor of `<SidebarUserNav />` reading `useZkLogin()` directly —
// Audric uses zkLogin (localStorage-backed) where server-side
// `getCurrentUser()` always returns null, so the prop was always
// `undefined` and the footer never rendered in production. Single
// consumer pattern + identity sourced from the canonical hook = no
// duplication, no template-debris re-port. Used by both `/chat/layout.tsx`
// (production) and `app/(chat)/layout.tsx` (legacy template route,
// deletes in Session 9a).

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile, toggleSidebar } = useSidebar();

  // [S.205 — 2026-05-20] "New chat" handler: dispatch the new-chat
  // signal so the AudricChatPanel re-mounts its `useChat()` instance
  // (clears the messages array, returns to the empty-state hero).
  // When the user is somewhere OTHER than /chat, also push to /chat so
  // the button doubles as navigation. The dispatch always fires —
  // harmless on first mount (no listeners yet, the panel hasn't
  // attached) and load-bearing when we're already on /chat (where
  // router.push to the same path is a no-op).
  const handleNewChat = () => {
    setOpenMobile(false);
    dispatchNewChat();
    if (pathname !== "/chat") {
      router.push("/chat");
    }
  };

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
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border pt-2 pb-3">
        <SidebarUserNav />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
