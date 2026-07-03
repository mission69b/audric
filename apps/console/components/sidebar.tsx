"use client";

import { clearSession } from "@audric/auth/client";
import {
  BarChart3,
  Bot,
  Boxes,
  CreditCard,
  ExternalLink,
  KeyRound,
  LayoutGrid,
  LogOut,
  PanelLeftClose,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/manage/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/manage/keys", label: "API keys", icon: KeyRound },
  { href: "/manage/agents", label: "My agents", icon: Bot },
  { href: "/manage/usage", label: "Usage", icon: BarChart3 },
  { href: "/manage/billing", label: "Billing", icon: CreditCard },
  { href: "/manage/models", label: "Models", icon: Boxes },
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
  handle,
  onToggle,
  onNavigate,
}: {
  email: string | null;
  address: string;
  balance: string;
  handle?: string | null;
  onToggle?: () => void;
  onNavigate?: () => void;
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
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sidebar-accent-foreground tracking-tight">
            t2000
          </span>
          <span className="rounded bg-sidebar-accent px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/70">
            platform
          </span>
        </div>
        {onToggle ? (
          <button
            aria-label="Collapse sidebar"
            className="rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={onToggle}
            type="button"
          >
            <PanelLeftClose className="size-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              href={href}
              key={href}
              onClick={onNavigate}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
        <a
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          href="https://developers.t2000.ai"
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="size-4" />
          Docs
        </a>
      </nav>

      <div className="space-y-0.5 border-sidebar-border border-t p-2">
        <Link
          className="block rounded-md px-2.5 py-2 transition-colors hover:bg-sidebar-accent"
          href="/manage/billing"
          onClick={onNavigate}
        >
          <div className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wide">
            Credit
          </div>
          <div className="font-semibold text-sidebar-accent-foreground tabular-nums">
            ${balance}
          </div>
        </Link>
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <div className="min-w-0 leading-tight">
            <div className="truncate font-mono text-sidebar-foreground/80 text-xs">
              {handle ?? shortAddress(address)}
            </div>
            {email ? (
              <div className="truncate text-[11px] text-sidebar-foreground/45">
                {email}
              </div>
            ) : null}
          </div>
          <button
            className="shrink-0 text-sidebar-foreground/50 transition-colors hover:text-sidebar-accent-foreground"
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
