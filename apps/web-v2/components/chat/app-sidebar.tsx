"use client";

/**
 * AppSidebar — canonical chrome for the /chat surface.
 *
 * [S.204+ Phase 6.7] Rewritten to v1 parity using shadcn `<Sidebar>`
 * primitives (NOT v1's custom flexbox `<aside>`). v1's 7-item nav +
 * BETA tag + RECENTS section are now present; v1's GlobalUsernameSearch
 * is deferred to a follow-up SPEC (its 3 lib deps + 2 API routes need
 * cross-app proxying that's out of scope for this pass).
 *
 * Nav routing strategy ("panel_strategy = stub_soon" per S.204+):
 *   - Dashboard         → /chat                (real route)
 *   - Settings          → /settings            (real route in v2)
 *   - Contacts          → /settings/contacts   (real route in v2)
 *   - Portfolio         → /coming-soon         (stub — Charts tool covers it)
 *   - Activity          → /coming-soon         (stub — activity_summary covers it)
 *   - Pay               → /coming-soon         (stub — send_transfer covers it)
 *   - Store             → /coming-soon         (stub — Phase 5 product)
 *
 * RECENTS pulls from apps/web's `/api/engine/sessions` via `audricWebUrl()`
 * (same cross-app pattern as use-user-status). Clicking a session
 * dispatches the new-chat event with the session ID; AudricChatPanel
 * re-mounts useChat() loading that session's prior messages. No URL
 * change — permalink URLs are deferred to v07d MemWal follow-up.
 *
 * Prior history (S.200 / S.205 context):
 *   - S.197b: AppSidebar was trimmed to brand + new-chat + sign-out
 *     during the chat-flip pause when v0.7c paused mid-cutover.
 *   - S.205: handleNewChat dispatches `audric:new-chat` so the panel's
 *     useChat re-mounts (router.push to same path is a no-op).
 *   - S.204+ (this SPEC): adds 7 nav items + RECENTS + BETA badge,
 *     keeps the rest.
 */

import {
  ActivityIcon,
  BookmarkIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  PanelLeftIcon,
  PenSquareIcon,
  PieChartIcon,
  SettingsIcon,
  ShoppingBagIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { ConvoHistoryList } from "@/components/chat/convo-history-list";
import { SidebarUserNav } from "@/components/chat/sidebar-user-nav";
import { AudricMark } from "@/components/ui/audric-mark";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { dispatchNewChat } from "@/lib/audric/new-chat-event";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface NavEntry {
  /** "dot" → tiny indicator; "soon" → SOON badge */
  badge?: "dot" | "soon";
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  id: string;
  label: string;
}

const NAV_ITEMS: NavEntry[] = [
  { id: "chat", label: "Dashboard", href: "/chat", icon: LayoutDashboardIcon },
  {
    id: "portfolio",
    label: "Portfolio",
    href: "/coming-soon",
    icon: PieChartIcon,
  },
  {
    id: "activity",
    label: "Activity",
    href: "/coming-soon",
    icon: ActivityIcon,
    badge: "dot",
  },
  { id: "pay", label: "Pay", href: "/coming-soon", icon: CreditCardIcon },
  {
    id: "contacts",
    label: "Contacts",
    href: "/settings/contacts",
    icon: UsersIcon,
  },
  {
    id: "store",
    label: "Store",
    href: "/coming-soon",
    icon: ShoppingBagIcon,
    badge: "soon",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: SettingsIcon,
  },
];

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile, toggleSidebar } = useSidebar();
  const { session, address } = useZkLogin();

  // [S.205 — 2026-05-20] "New chat" handler: dispatch the new-chat
  // signal so AudricChatPanel re-mounts its `useChat()` instance
  // (clears messages, returns to empty state). When the user is
  // somewhere OTHER than /chat, also push to /chat so the button
  // doubles as navigation. The dispatch always fires — harmless on
  // first mount and load-bearing when already on /chat (router.push
  // to same path is a no-op).
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
            {/* Brand wordmark + BETA badge (collapsible-hidden) */}
            <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
              <span className="font-medium text-[14px] text-sidebar-foreground tracking-[-0.01em]">
                Audric
              </span>
              <Badge
                className="h-[18px] rounded-sm border border-sidebar-border bg-transparent px-1.5 font-mono text-[9px] text-sidebar-foreground/60 uppercase tracking-[0.1em] hover:bg-transparent"
                variant="outline"
              >
                Beta
              </Badge>
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <SidebarTrigger className="text-sidebar-foreground/60 transition-colors duration-150 hover:text-sidebar-foreground" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* New chat */}
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

        {/* Nav items */}
        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const IconComponent = item.icon;
                // Active when the current pathname is exactly the item's
                // href OR starts with `${item.href}/` (e.g. settings/contacts
                // marks both Contacts active AND Settings active — that's
                // expected since contacts is a settings subroute).
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/chat" &&
                    pathname.startsWith(`${item.href}/`));
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      className="h-8 text-[13px] text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setOpenMobile(false)}
                      >
                        <IconComponent className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge === "dot" && (
                      <SidebarMenuBadge className="size-1.5 rounded-full bg-info-solid px-0 py-0 text-transparent">
                        ·
                      </SidebarMenuBadge>
                    )}
                    {item.badge === "soon" && (
                      <SidebarMenuBadge className="h-4 rounded-sm border border-sidebar-border bg-transparent px-1 font-mono text-[8.5px] text-sidebar-foreground/50 uppercase tracking-[0.08em]">
                        Soon
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* RECENTS */}
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="font-mono text-[9px] text-sidebar-foreground/40 uppercase tracking-[0.12em]">
            <BookmarkIcon className="mr-1.5 size-3" />
            Recents
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ConvoHistoryList
              address={address ?? undefined}
              jwt={session?.jwt}
              onLoadSession={() => {
                // [S.204+ sessions = defer_v07d] Click navigates to /chat
                // and dispatches new-chat to reset the panel. The session's
                // PRIOR MESSAGES are not loaded into useChat — that's v07d
                // MemWal work (memory recall is the transparent upgrade
                // path: when MemWal lands, the new chat hydrates with the
                // selected session's memory context). For now, RECENTS is
                // a read-only orientation surface so the user can see
                // their session history is being captured.
                dispatchNewChat();
                setOpenMobile(false);
                if (pathname !== "/chat") {
                  router.push("/chat");
                }
              }}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t pt-2 pb-3">
        <SidebarUserNav />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
