"use client";

/**
 * Settings layout — shared chrome for `/settings/*` sub-routes.
 *
 * Layout (matches `apps/web/app/settings/page.tsx` D10 design):
 *   - Header strip: "← Back to chat" left + "SETTINGS" mono eyebrow right
 *   - Two-pane below on md+: 220px sub-nav left + scroll content area right
 *   - Mono eyebrow with active section name + bottom border above content
 *
 * v0.7d Phase 3 LITE (2026-05-21, S.218): the Memory section now
 * renders MemWal recall results via `MemorySection` — top-K records
 * matching a broad-list query. Per-fact delete + provenance linking
 * are deferred to Phase 3.5 backlog.
 */

import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type Section = "passport" | "safety" | "memory" | "contacts";

const SECTIONS: Array<{
  id: Section;
  label: string;
  href: string;
}> = [
  { id: "passport", label: "Passport", href: "/settings/passport" },
  { id: "safety", label: "Safety", href: "/settings/safety" },
  { id: "memory", label: "Memory", href: "/settings/memory" },
  { id: "contacts", label: "Contacts", href: "/settings/contacts" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeSection = (() => {
    const match = SECTIONS.find(
      (s) => pathname === s.href || pathname.startsWith(`${s.href}/`)
    );
    return match?.id ?? "passport";
  })();
  const activeLabel =
    SECTIONS.find((s) => s.id === activeSection)?.label.toUpperCase() ?? "";

  // [S.208 — 2026-05-20] Wrap Settings with the same SidebarProvider +
  // AppSidebar chrome as /chat so the left rail stays visually consistent
  // between surfaces. Pre-S.208 Settings had its own bare layout, which
  // made navigating from /chat → Settings feel like a different app
  // (the AppSidebar disappeared, replaced by Settings' own sub-nav).
  // Now the AppSidebar persists; the Settings sub-nav (Passport /
  // Safety / Memory / Contacts) lives inside SidebarInset as a
  // secondary nav.
  //
  // SidebarProvider's `defaultOpen` is read from the `sidebar_state`
  // cookie in `/chat/layout.tsx` — Settings is client-only here so we
  // accept the default open state. The cookie still gets written/read
  // on /chat, and SidebarProvider hydrates from it via its internal
  // useEffect; a brief flash on first Settings visit is acceptable
  // (subsequent visits within the session share state).
  return (
    <AuthGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <main className="flex h-dvh flex-col overflow-hidden bg-background">
            <header className="flex items-center justify-between border-b border-border/40 px-6 py-[18px] sm:px-8">
              <Link
                className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition hover:text-foreground focus-visible:underline focus-visible:outline-none"
                href="/chat"
              >
                <ChevronLeftIcon size={14} />
                Back to chat
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Settings
              </span>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_1fr] overflow-hidden md:grid-cols-[220px_1fr] md:grid-rows-none">
              <aside className="flex flex-row gap-1 self-start overflow-x-auto border-b border-border/40 px-3 py-2.5 md:flex-col md:self-auto md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:px-3.5 md:py-5">
                {SECTIONS.map((s) => {
                  const isActive = activeSection === s.id;
                  return (
                    <Link
                      aria-current={isActive ? "true" : undefined}
                      className={[
                        "whitespace-nowrap rounded-pill px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.1em] transition focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none md:px-3.5 md:py-2.5",
                        isActive
                          ? "bg-secondary text-foreground shadow-[var(--shadow-flat)]"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      ].join(" ")}
                      href={s.href}
                      key={s.id}
                    >
                      {s.label}
                    </Link>
                  );
                })}
              </aside>

              <section className="min-h-0 overflow-y-auto px-6 py-7 sm:px-10">
                <div className="mx-auto max-w-[640px]">
                  <div className="border-border/40 border-b pb-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {activeLabel}
                  </div>
                  <div className="pt-[22px]">{children}</div>
                </div>
              </section>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}
