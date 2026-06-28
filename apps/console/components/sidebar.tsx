"use client";

import { clearSession } from "@audric/auth/client";
import {
  BarChart3,
  Boxes,
  CreditCard,
  ExternalLink,
  KeyRound,
  LayoutGrid,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/keys", label: "API keys", icon: KeyRound },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/models", label: "Models", icon: Boxes },
];

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

export function AppSidebar({
  email,
  address,
  balance,
}: {
  email: string | null;
  address: string;
  balance: string;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  async function signOut() {
    clearSession();
    await fetch("/api/auth/session", { method: "DELETE" }).catch(
      () => undefined
    );
    window.location.href = "/";
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pt-3">
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row items-center justify-between">
            <SidebarMenuButton
              asChild
              className="w-fit gap-2 group-data-[collapsible=icon]:hidden"
              tooltip="t2000 platform"
            >
              <Link href="/dashboard" onClick={() => setOpenMobile(false)}>
                <span className="font-semibold text-sidebar-accent-foreground tracking-tight">
                  t2000
                </span>
                <span className="rounded bg-sidebar-accent px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/70">
                  platform
                </span>
              </Link>
            </SidebarMenuButton>
            <SidebarTrigger className="text-sidebar-foreground/60 hover:text-sidebar-foreground" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    tooltip={label}
                  >
                    <Link href={href} onClick={() => setOpenMobile(false)}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Docs">
                  <a
                    href="https://developers.t2000.ai"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink />
                    <span>Docs</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={`$${balance} credit`}>
              <Link href="/billing">
                <CreditCard />
                <span className="tabular-nums">${balance} credit</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out">
              <LogOut />
              <span className="truncate">{email ?? shortAddress(address)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
