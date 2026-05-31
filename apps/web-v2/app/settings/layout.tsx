"use client";

/**
 * Settings layout — shared chrome for `/settings/*` sub-routes.
 *
 * [R6.5 5e — 2026-05-31] Single-nav model: the AppSidebar itself swaps to
 * the settings tabs (Passport / Safety / Memory) when in /settings (see
 * `app-sidebar.tsx`), so this layout no longer renders a secondary 220px
 * sub-nav rail. Each tab is its own scrolling page; the layout supplies
 * the page title + mono sub from the active route and a slim header
 * (mobile sidebar trigger + eyebrow).
 *
 * v0.7d Phase 3 LITE (2026-05-21, S.218): the Memory section renders
 * MemWal recall results via `MemorySection` — top-K records matching a
 * broad-list query. Per-fact delete + provenance linking are deferred.
 */

import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/chat/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type Section = "passport" | "safety" | "memory";

const SECTION_META: Record<Section, { title: string; sub: string }> = {
  passport: {
    title: "Passport",
    sub: "Your identity, wallet, and session",
  },
  safety: {
    title: "Safety",
    sub: "Spending limits and transaction guards",
  },
  memory: {
    title: "Memory",
    sub: "What Audric remembers about you",
  },
};

const SECTION_HREFS: Array<{ id: Section; href: string }> = [
  { id: "passport", href: "/settings/passport" },
  { id: "safety", href: "/settings/safety" },
  { id: "memory", href: "/settings/memory" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeSection =
    SECTION_HREFS.find(
      (s) => pathname === s.href || pathname.startsWith(`${s.href}/`)
    )?.id ?? "passport";
  const meta = SECTION_META[activeSection];

  return (
    <AuthGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <main className="flex h-dvh flex-col overflow-hidden bg-background">
            <header className="flex items-center justify-between border-b border-border/40 px-6 py-[18px] sm:px-8">
              {/* [L1 — 2026-05-31] Mobile-only (`md:hidden`) to match the
                  chat surface. On desktop the AppSidebar's own trigger is
                  the single drawer toggle; without this the settings
                  header rendered a SECOND always-visible trigger. */}
              <SidebarTrigger className="text-muted-foreground transition-colors hover:text-foreground md:hidden" />
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Settings
              </span>
            </header>

            <section className="min-h-0 flex-1 overflow-y-auto px-6 py-10 sm:px-10">
              <div className="mx-auto max-w-[640px]">
                <h1 className="font-medium font-sans text-[28px] text-foreground tracking-[-0.025em]">
                  {meta.title}
                </h1>
                <p className="mt-1.5 mb-8 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
                  {meta.sub}
                </p>
                {children}
              </div>
            </section>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}
