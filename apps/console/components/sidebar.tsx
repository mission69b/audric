"use client";

import { clearSession } from "@audric/auth/client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/keys", label: "API keys" },
  { href: "/usage", label: "Usage" },
  { href: "/billing", label: "Billing" },
  { href: "/models", label: "Models" },
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
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-[var(--border-bright)] border-r bg-[var(--surface)]/40">
      <div className="px-5 pt-6 pb-5">
        <div className="font-semibold text-[15px] text-[var(--foreground)] tracking-tight">
          t2000
        </div>
        <div className="font-mono text-[11px] text-[var(--dim)] tracking-wide">
          platform
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[var(--t2k-accent-bg)] font-medium text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--t2k-accent-bg)] hover:text-[var(--foreground)]"
              }`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
        <a
          className="rounded-lg px-3 py-2 text-[var(--muted)] text-sm transition-colors hover:text-[var(--foreground)]"
          href="https://developers.t2000.ai"
          rel="noreferrer"
          target="_blank"
        >
          Docs ↗
        </a>
      </nav>

      <div className="border-[var(--border-bright)] border-t p-3">
        <Link
          className="block rounded-lg px-3 py-2 transition-colors hover:bg-[var(--t2k-accent-bg)]"
          href="/billing"
        >
          <div className="text-[11px] text-[var(--dim)] uppercase tracking-wide">
            Credit
          </div>
          <div className="font-semibold text-[var(--foreground)] text-lg">
            ${balance}
          </div>
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-[12px] text-[var(--muted)]">
              {email ?? shortAddress(address)}
            </div>
          </div>
          <button
            className="shrink-0 text-[12px] text-[var(--dim)] transition-colors hover:text-[var(--foreground)]"
            onClick={signOut}
            type="button"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
