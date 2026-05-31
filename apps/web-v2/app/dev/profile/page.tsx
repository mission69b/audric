"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ProfilePublicCard } from "@/components/profile/profile-public-card";
import { cn } from "@/lib/utils";

/**
 * Dev-only harness for R6.6 6c — the public creator profile card
 * (`phase2-profile-legal.html` CP4). Renders the real `ProfilePublicCard`
 * (the same component the server-rendered `/[username]` page uses) with a
 * mock address, so this verifies the actual chrome, not a copy. The live
 * portfolio panel + claim footer that wrap it on the real page are page-level
 * and omitted here. Gated to non-production.
 */

const MOCK_ADDRESS =
  "0xe1c0e0a3d2e5d22c5d4c4e63b53f86d9a8e7f17700000000000000000000f177";

export default function ProfileHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Profile card harness
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-profile-legal.html CP4"}
        </span>
        <div className="ml-auto flex items-center gap-2">
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

      <main className="mx-auto w-full max-w-md px-4 py-12">
        <ProfilePublicCard
          address={MOCK_ADDRESS}
          displayHandle="funkii@audric"
          label="funkii"
        />
      </main>
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
