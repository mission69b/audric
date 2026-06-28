"use client";

import { PanelLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "console:sidebar-open";

export function ConsoleShell({
  email,
  address,
  balance,
  children,
}: {
  email: string | null;
  address: string;
  balance: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      setOpen(saved === "1");
    }
  }, []);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "w-64" : "w-0"
        )}
      >
        <Sidebar
          address={address}
          balance={balance}
          email={email}
          onToggle={toggle}
        />
      </div>

      <main className="relative min-w-0 flex-1 overflow-x-hidden">
        {open ? null : (
          <button
            aria-label="Open sidebar"
            className="absolute top-4 left-4 z-10 rounded-md border border-border/50 bg-card/60 p-2 text-muted-foreground transition-colors hover:text-foreground"
            onClick={toggle}
            type="button"
          >
            <PanelLeft className="size-4" />
          </button>
        )}
        <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">{children}</div>
      </main>
    </div>
  );
}
