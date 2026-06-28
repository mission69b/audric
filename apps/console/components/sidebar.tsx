"use client";

import { clearSession } from "@audric/auth/client";
import { cn } from "@t2000/ui";
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

export function Sidebar({
  email,
  address,
  balance,
}: {
  email: string | null;
  address: string;
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
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col border-border border-r bg-background">
      <div className="flex h-14 items-center gap-2 border-border border-b px-5">
        <span className="font-semibold text-foreground tracking-tight">
          t2000
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          platform
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              href={href}
              key={href}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
        <a
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted/60 hover:text-foreground"
          href="https://developers.t2000.ai"
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="size-4" />
          Docs
        </a>
      </nav>

      <div className="space-y-1 border-border border-t p-3">
        <Link
          className="block rounded-md px-3 py-2 transition-colors hover:bg-muted/60"
          href="/billing"
        >
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
            Credit
          </div>
          <div className="font-semibold text-foreground text-lg">
            ${balance}
          </div>
        </Link>
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="truncate text-muted-foreground text-xs">
            {email ?? shortAddress(address)}
          </span>
          <button
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            onClick={signOut}
            title="Sign out"
            type="button"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
