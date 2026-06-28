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
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setIsMobile(mq.matches);
      if (mq.matches) {
        setOpen(false);
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        setOpen(saved === null ? true : saved === "1");
      }
    };
    apply();
    setMounted(true);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (!isMobile) {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  // close the drawer after tapping a nav item on mobile
  function handleNavigate() {
    if (isMobile) {
      setOpen(false);
    }
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {isMobile ? (
        <>
          {open ? (
            <button
              aria-label="Close sidebar"
              className="fixed inset-0 z-30 bg-black/50"
              onClick={toggle}
              type="button"
            />
          ) : null}
          <div
            className={cn(
              "fixed inset-y-0 left-0 z-40",
              mounted &&
                "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              open ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <Sidebar
              address={address}
              balance={balance}
              email={email}
              onNavigate={handleNavigate}
              onToggle={toggle}
            />
          </div>
        </>
      ) : (
        <div
          className={cn(
            "shrink-0 overflow-hidden",
            mounted &&
              "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            open ? "w-64" : "w-0"
          )}
        >
          <Sidebar
            address={address}
            balance={balance}
            email={email}
            onNavigate={handleNavigate}
            onToggle={toggle}
          />
        </div>
      )}

      <main className="relative min-w-0 flex-1 overflow-x-hidden">
        {open ? null : (
          <button
            aria-label="Open sidebar"
            className="absolute top-3 left-3 z-20 rounded-md border border-border/50 bg-card p-2 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            onClick={toggle}
            type="button"
          >
            <PanelLeft className="size-4" />
          </button>
        )}
        <div
          className={cn(
            "mx-auto max-w-3xl space-y-4 px-6 pb-10",
            open ? "pt-10" : "pt-16"
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
