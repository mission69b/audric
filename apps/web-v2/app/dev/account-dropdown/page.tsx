"use client";

import { ChevronUp } from "lucide-react";
import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { AccountMenuContent } from "@/components/chat/sidebar-user-nav";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Dev-only harness for R6.5 5a — the account dropdown
 * (`t2000-AFI/audric/phase2-account-dropdown.html`). `AccountMenuContent`
 * is presentational (pure props), so we drive it here with fixtures and
 * the header toggles (theme + connected/offline) to screenshot-diff vs
 * the prototype. The menu is held open (`open` controlled) and
 * `modal={false}` so the header toggles stay clickable. Gated to
 * non-production.
 */
const AVATAR_GRADIENT =
  "linear-gradient(135deg, oklch(0.35 0.08 220), oklch(0.25 0.05 260))";

export default function AccountDropdownHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const [offline, setOffline] = useState(false);
  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Account dropdown harness
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-account-dropdown.html"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle
            active={!offline}
            label="Connected"
            onClick={() => setOffline(false)}
          />
          <Toggle
            active={offline}
            label="Offline"
            onClick={() => setOffline(true)}
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

      <main className="flex flex-col items-center gap-6 px-6 pt-16 pb-[420px]">
        <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
          {"// "}
          {offline
            ? "03 OFFLINE — reconnecting + retry"
            : "02 OPEN — connected"}
        </span>

        {/* Sidebar-frame mimic: trigger row at the bottom, menu opens up */}
        <div className="relative flex h-[320px] w-[280px] flex-col justify-end overflow-visible rounded-[10px] border border-border bg-sidebar">
          <div className="flex-1 p-4">
            <div className="mb-2 h-3 w-[85%] rounded-[3px] bg-muted" />
            <div className="mb-2 h-3 w-[70%] rounded-[3px] bg-muted" />
            <div className="h-3 w-[50%] rounded-[3px] bg-muted" />
          </div>
          <DropdownMenu modal={false} open>
            <DropdownMenuTrigger asChild>
              <button
                aria-expanded="true"
                className="grid w-full grid-cols-[28px_1fr_16px] items-center gap-2.5 border-border border-t bg-muted px-3.5 py-2.5 text-left"
                type="button"
              >
                <span
                  className="size-7 rounded-full ring-1 ring-border/60"
                  style={{ background: AVATAR_GRADIENT }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[13px] text-foreground">
                    funkii@audric
                  </span>
                  <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                    funkiirabu@gmail.com
                  </span>
                </span>
                <ChevronUp className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <AccountMenuContent
              activeTheme={isDark ? "dark" : "light"}
              avatarGradient={AVATAR_GRADIENT}
              email="funkiirabu@gmail.com"
              isOffline={offline}
              onRetry={() => undefined}
              onSignOut={() => undefined}
              onTheme={setTheme}
              primaryLabel="funkii@audric"
              totalBalance={offline ? null : 1853.04}
            />
          </DropdownMenu>
        </div>
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
