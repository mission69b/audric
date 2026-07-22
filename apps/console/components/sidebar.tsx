"use client";

import {
  BarChart3,
  Bot,
  Boxes,
  CreditCard,
  Inbox,
  KeyRound,
  LayoutGrid,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Console sidebar (t2000-design/agents ManageConsole §Sidebar): grouped nav,
// then the two-balance money block — USDC → agent payments · Credit →
// Private Inference — stated once. Identity (email + address) and sign-out
// live in the top nav's wallet chip; Docs is in the top nav (QA ER-003/004:
// no duplicate identity or Docs down here). Card-path buyers (sign in → key →
// base URL) get Private Inference first; agent/wallet surfaces stay one group
// down (item 10: progressive disclosure, not removal).
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
      { href: "/manage/jobs", label: "Job inbox", icon: Inbox },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/manage/billing", label: "Wallet & billing", icon: CreditCard },
    ],
  },
];

export function Sidebar({
  balance,
  walletUsdc,
  onNavigate,
}: {
  /** Platform credit (Private Inference), formatted "12.34". */
  balance: string;
  /** On-chain Passport USDC — null when the RPC read failed. */
  walletUsdc: number | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r pt-[26px] pr-4 pb-[26px] max-md:px-3"
      style={{
        borderColor: "var(--ag-border)",
        background: "var(--ag-canvas)",
      }}
    >
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
    </aside>
  );
}
