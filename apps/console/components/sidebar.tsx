"use client";

import {
  BarChart3,
  Bot,
  Boxes,
  CreditCard,
  ExternalLink,
  KeyRound,
  LayoutGrid,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Console sidebar (t2000-design/agents ManageConsole §Sidebar): identity
// block (monogram tile + @handle + copy-address), grouped nav, then the
// two-balance money block — USDC → agent payments · Credit → Private Inference —
// stated once, and Docs ↗. Sign-out lives in the top nav's wallet chip.
// Card-path buyers (sign in → key → base URL) get Private Inference first;
// agent/wallet surfaces stay one group down (item 10: progressive disclosure,
// not removal).
const NAV_GROUPS: {
  label: string;
  items: { href: string; label: string; icon: typeof LayoutGrid }[];
}[] = [
  {
    label: "Private Inference",
    items: [
      { href: "/manage/keys", label: "API keys", icon: KeyRound },
      { href: "/manage/usage", label: "Usage", icon: BarChart3 },
      { href: "/manage/models", label: "Models", icon: Boxes },
    ],
  },
  {
    label: "Your agents",
    items: [
      { href: "/manage/dashboard", label: "Overview", icon: LayoutGrid },
      { href: "/manage/create", label: "Create agent", icon: Plus },
      { href: "/manage/agents", label: "My agents", icon: Bot },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/manage/billing", label: "Wallet & billing", icon: CreditCard },
    ],
  },
];

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

export function Sidebar({
  address,
  balance,
  walletUsdc,
  handle,
  onNavigate,
}: {
  address: string;
  /** Platform credit (Private Inference), formatted "12.34". */
  balance: string;
  /** On-chain Passport USDC — null when the RPC read failed. */
  walletUsdc: number | null;
  handle?: string | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);

  return (
    <aside
      className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r pt-[26px] pr-4 pb-[26px] max-md:px-3"
      style={{
        borderColor: "var(--ag-border)",
        background: "var(--ag-canvas)",
      }}
    >
      {/* Identity — who is signed in (design: tile + handle + copy address). */}
      <div className="px-3 pb-[18px]">
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-[34px] items-center justify-center rounded-[9px] border font-mono text-[13px] text-fg-muted"
            style={{
              background: "var(--ag-overlay)",
              borderColor: "var(--ag-border)",
            }}
          >
            ◎
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-[13.5px] text-foreground">
              {handle ?? shortAddress(address)}
            </div>
            <button
              className="flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle transition-colors hover:text-fg-muted"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                } catch {
                  // clipboard unavailable
                }
              }}
              title="Copy address"
              type="button"
            >
              {copied ? "Copied ✓" : shortAddress(address)}
              {!copied && (
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="11"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  viewBox="0 0 16 16"
                  width="11"
                >
                  <rect height="8" rx="1.5" width="8" x="5.5" y="5.5" />
                  <path
                    d="M10.5 5.5V3.5A1 1 0 0 0 9.5 2.5h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-[7px] font-medium font-mono text-[9.5px] text-fg-subtle uppercase tracking-[0.12em]">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    className={cn(
                      "flex items-center gap-[11px] rounded-[7px] px-3 py-2 font-medium text-[13.5px] transition-colors",
                      active
                        ? "bg-[color:var(--ag-overlay)] text-foreground"
                        : "text-fg-muted hover:bg-[color:var(--ag-card)] hover:text-foreground"
                    )}
                    href={href}
                    key={href}
                    onClick={onNavigate}
                  >
                    <Icon className="size-4" strokeWidth={1.3} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <span className="flex-1" />

      {/* Two-balance money block — the model, stated once (design). */}
      <Link
        className="ag-card mt-5 block px-3.5 py-[13px] no-underline"
        href="/manage/billing"
        onClick={onNavigate}
      >
        {(
          [
            [
              "USDC",
              walletUsdc === null ? "—" : `$${walletUsdc.toFixed(2)}`,
              "agent payments",
              "var(--ag-verify)",
            ],
            [
              "Credit",
              `$${balance}`,
              "Private Inference + Audric",
              "var(--ag-accent)",
            ],
          ] as const
        ).map(([k, v, note, c], i) => (
          <div
            className="flex items-baseline justify-between gap-2"
            key={k}
            style={
              i
                ? {
                    paddingTop: 9,
                    marginTop: 9,
                    borderTop: "1px solid var(--ag-border)",
                  }
                : undefined
            }
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: c }}
                />
                <span className="font-semibold text-[12.5px] text-foreground">
                  {k}
                </span>
              </div>
              <div className="mt-0.5 pl-3 font-mono text-[10px] text-fg-subtle">
                {note}
              </div>
            </div>
            <span className="font-mono text-[13.5px] text-foreground tabular-nums">
              {v}
            </span>
          </div>
        ))}
      </Link>

      <a
        className="mt-1 flex items-center gap-2 px-3 py-2.5 font-medium text-[13px] text-fg-subtle no-underline transition-colors hover:text-foreground"
        href="https://developers.t2000.ai"
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink className="size-[15px]" strokeWidth={1.3} />
        Docs ↗
      </a>
    </aside>
  );
}
