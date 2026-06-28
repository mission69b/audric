"use client";

import { clearSession } from "@audric/auth/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/keys", label: "API keys" },
  { href: "/usage", label: "Usage" },
  { href: "/billing", label: "Billing" },
  { href: "/models", label: "Models" },
];

export function ConsoleHeader({
  email,
  balance,
}: {
  email: string | null;
  balance: string;
}) {
  const pathname = usePathname();

  async function signOut() {
    clearSession();
    await fetch("/api/auth/session", { method: "DELETE" }).catch(
      () => undefined
    );
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-10 border-border/50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground tracking-tight">
            t2000
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            platform
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link
            className="text-muted-foreground tabular-nums transition-colors hover:text-foreground"
            href="/billing"
            title="Credit balance"
          >
            ${balance}
          </Link>
          {email ? (
            <span className="hidden max-w-40 truncate text-muted-foreground sm:inline">
              {email}
            </span>
          ) : null}
          <button
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={signOut}
            type="button"
          >
            Sign out
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                href={href}
                key={href}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
