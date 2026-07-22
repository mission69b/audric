"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";

// Console grid (t2000-design/agents ManageConsole): the store nav sits on
// top (rendered by the layout); under it a 1400px grid — 240px sidebar +
// main. Mobile: the sidebar becomes a drawer behind a Menu button + scrim.
export function ConsoleShell({
  balance,
  walletUsdc,
  children,
}: {
  balance: string;
  walletUsdc: number | null;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="mx-auto grid min-h-[calc(100vh-62px)] w-full max-w-[1400px] px-6 md:grid-cols-[240px_1fr]">
      {/* Desktop: static column. Mobile: fixed drawer. */}
      <div
        className={
          navOpen
            ? "fixed inset-y-0 left-0 z-50 md:static md:z-auto"
            : "hidden md:block"
        }
      >
        <Sidebar
          balance={balance}
          onNavigate={() => setNavOpen(false)}
          walletUsdc={walletUsdc}
        />
      </div>
      {navOpen && (
        // biome-ignore lint/a11y/noStaticElementInteractions: scrim click-to-close
        // biome-ignore lint/a11y/useKeyWithClickEvents: drawer closes via nav taps too
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <main className="min-w-0 py-[30px] md:pl-7">
        <button
          className="ag-btn ag-btn--ghost ag-btn--sm mb-[18px] gap-2 md:hidden"
          onClick={() => setNavOpen(true)}
          type="button"
        >
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
          Menu
        </button>
        {children}
      </main>
    </div>
  );
}
