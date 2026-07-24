"use client";

import Link from "next/link";
import { useState } from "react";
import { WalletChip } from "@/components/wallet-chip";

// The 62px site header — shared by the public store (directory) AND the
// signed-in console (the design keeps this nav on top of /manage; the console
// grid sits under it). Client component: the wallet chip hydrates from
// localStorage and the mobile menu needs local open state — at <md the four
// links collapse behind a hamburger so the sign-in / wallet chip always fits
// on screen (pre-fix it sat at x=405 on a 390px viewport).
const LINKS = [
  // The job-class slot, live since SPEC_A2A_ESCROW slice 2: deliverable
  // work escrowed in on-chain Job objects.
  { href: "/jobs", label: "Jobs" },
  // The full Agent ID registry — the store homepage lists SELLING agents
  // only (2026-07-18).
  { href: "/agents", label: "Agents" },
  // Agent tokens (SPEC_ACP_SUI §6 Phase 3 — Capital Market).
  { href: "/capital", label: "Capital" },
  { href: "/activity", label: "Activity" },
] as const;

export function StoreNav() {
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md backdrop-saturate-150"
      style={{
        background: "rgba(8,9,10,0.78)",
        borderBottomColor: "var(--ag-border)",
      }}
    >
      <div className="relative mx-auto flex h-[62px] w-full max-w-[1400px] items-center gap-6 px-6 max-md:gap-3 max-md:px-4">
        <Link
          className="inline-flex items-center gap-2 text-foreground no-underline"
          href="/"
          onClick={() => setOpen(false)}
        >
          <span
            aria-hidden="true"
            className="font-bold text-[20px] leading-none tracking-[-0.05em]"
          >
            t2
          </span>
          <span className="font-semibold text-[16px] tracking-[-0.022em]">
            agents
          </span>
        </Link>

        {/* Desktop links — unchanged layout at md+. */}
        <nav className="ml-1.5 flex items-center gap-5 font-medium text-[13.5px] text-muted-foreground tracking-[-0.011em] max-md:hidden">
          {LINKS.map((l) => (
            <Link
              className="transition-colors hover:text-foreground"
              href={l.href}
              key={l.href}
            >
              {l.label}
            </Link>
          ))}
          <a
            className="transition-colors hover:text-foreground"
            href="https://developers.t2000.ai"
            rel="noreferrer"
            target="_blank"
          >
            Docs&nbsp;↗
          </a>
        </nav>

        <span className="flex-1" />

        <WalletChip />

        {/* Mobile menu toggle — sits AFTER the chip so sign-in stays the
            rightmost persistent action. */}
        <button
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border text-foreground transition-colors md:hidden"
          onClick={() => setOpen((o) => !o)}
          style={{
            background: "var(--ag-overlay)",
            borderColor: open ? "var(--ag-border-hi)" : "var(--ag-border)",
          }}
          type="button"
        >
          {open ? (
            <svg
              aria-hidden="true"
              fill="none"
              height="15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.5"
              viewBox="0 0 16 16"
              width="15"
            >
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              fill="none"
              height="15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.5"
              viewBox="0 0 16 16"
              width="15"
            >
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown — overlays the page (absolute, solid bg) so the
          sticky header doesn't grow and shift content. */}
      {open && (
        <nav
          className="absolute inset-x-0 top-full z-40 border-b shadow-[0_24px_48px_-16px_rgba(0,0,0,0.85)] md:hidden"
          style={{
            background: "#0a0b0c",
            borderBottomColor: "var(--ag-border)",
          }}
        >
          <div className="mx-auto grid max-w-[1400px] gap-0.5 px-4 py-3">
            {LINKS.map((l) => (
              <Link
                className="rounded-[7px] px-3 py-2.5 font-medium text-[14px] text-muted-foreground no-underline transition-colors hover:bg-[color:var(--ag-overlay)] hover:text-foreground"
                href={l.href}
                key={l.href}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <a
              className="rounded-[7px] px-3 py-2.5 font-medium text-[14px] text-muted-foreground no-underline transition-colors hover:bg-[color:var(--ag-overlay)] hover:text-foreground"
              href="https://developers.t2000.ai"
              onClick={() => setOpen(false)}
              rel="noreferrer"
              target="_blank"
            >
              Docs&nbsp;↗
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
