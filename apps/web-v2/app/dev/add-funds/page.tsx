"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { AddFundsModal } from "@/components/chat/add-funds-modal";
import { cn } from "@/lib/utils";

/**
 * Dev-only harness for R6.5 5b — the Add funds modal
 * (`t2000-AFI/audric/phase2-add-funds.html`, states 01 Receive + 02 Buy).
 *
 * The modal is rendered open; switch tabs (Receive / Buy with bank) inside
 * it. Toggle "no handle" to verify the unclaimed-handle fallback (address-only
 * hero + "Copy address"). Gated to non-production.
 */
const MOCK_ADDRESS =
  "0xe1c0e0a3d2e5d22c5d4c4e63b53f86d9a8e7f17700000000000000000000f177";

export default function AddFundsHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(true);
  const [hasHandle, setHasHandle] = useState(true);
  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Add funds harness
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-add-funds.html"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle active={open} label="Open" onClick={() => setOpen(true)} />
          <Toggle
            active={hasHandle}
            label="Has handle"
            onClick={() => setHasHandle((v) => !v)}
          />
          <span className="mx-1 h-4 w-px bg-border" />
          <Toggle
            active={!isDark}
            label="Light"
            onClick={() => setTheme("light")}
          />
          <Toggle
            active={isDark}
            label="Dark"
            onClick={() => setTheme("dark")}
          />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-6 py-16 text-center">
        <button
          className="inline-flex h-9 items-center rounded-lg border border-border px-4 font-medium font-sans text-[13px] text-foreground transition hover:bg-accent"
          onClick={() => setOpen(true)}
          type="button"
        >
          Reopen modal
        </button>
      </main>

      <AddFundsModal
        address={MOCK_ADDRESS}
        onClose={() => setOpen(false)}
        open={open}
        username={hasHandle ? "funkii" : null}
      />
    </div>
  );
}

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-md border px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] transition-colors",
        active
          ? "border-border bg-card text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
