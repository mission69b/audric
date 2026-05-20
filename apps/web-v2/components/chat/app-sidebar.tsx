"use client";

import { PanelLeftIcon, PenSquareIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { AudricSessionUser as User } from "@/lib/audric-auth";
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
// AppSidebar itself is dead code post-Session-6 chat-flip (Path A
// retargets traffic to `/audric-chat`, which renders without this
// sidebar). Trimmed nonetheless so the preview-deploy smoke window
// presents Audric chrome — not template debris — at every URL.

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile, toggleSidebar } = useSidebar();

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
        {user && <SidebarUserNav user={user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
