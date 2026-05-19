"use client";

/**
 * Settings layout — shared chrome for `/settings/*` sub-routes.
 *
 * Layout (matches `apps/web/app/settings/page.tsx` D10 design):
 *   - Header strip: "← Back to chat" left + "SETTINGS" mono eyebrow right
 *   - Two-pane below on md+: 220px sub-nav left + scroll content area right
 *   - Mono eyebrow with active section name + bottom border above content
 *
 * v0.7c Phase 6 Session 2: Memory section appears in the nav but its
 * page is a v0.7d deferral signpost (see `/settings/memory/page.tsx`).
 * The actual UserMemory CRUD is rebuilt in v0.7d once MemWal stabilises.
 */

import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";

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

  return (
    <AuthGuard>
      <main className="flex h-screen flex-col overflow-hidden bg-surface-page">
        <header className="flex items-center justify-between border-b border-border-subtle px-6 py-[18px] sm:px-8">
          <Link
            className="inline-flex items-center gap-1.5 text-[13px] text-fg-secondary transition hover:text-fg-primary focus-visible:underline focus-visible:outline-none"
            href="/"
          >
            <ChevronLeftIcon size={14} />
            Back to chat
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-secondary">
            Settings
          </span>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_1fr] overflow-hidden md:grid-cols-[220px_1fr] md:grid-rows-none">
          <aside className="flex flex-row gap-1 self-start overflow-x-auto border-b border-border-subtle px-3 py-2.5 md:flex-col md:self-auto md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:px-3.5 md:py-5">
            {SECTIONS.map((s) => {
              const isActive = activeSection === s.id;
              return (
                <Link
                  aria-current={isActive ? "true" : undefined}
                  className={[
                    "whitespace-nowrap rounded-pill px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.1em] transition focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none md:px-3.5 md:py-2.5",
                    isActive
                      ? "bg-surface-card text-fg-primary shadow-[var(--shadow-flat)]"
                      : "text-fg-muted hover:bg-surface-card hover:text-fg-primary",
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
              <div className="border-border-subtle border-b pb-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">
                {activeLabel}
              </div>
              <div className="pt-[22px]">{children}</div>
            </div>
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}
