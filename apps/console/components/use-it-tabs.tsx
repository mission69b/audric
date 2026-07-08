"use client";

import { useEffect, useState } from "react";

// The listing's "Use it" surface — a catalog CARD that opens a centered MODAL
// with the tabbed panel (founder 2026-07-08: the OKX "How to use this
// service?" pattern; in-card expansion reflowed the 20-card grid). The tab
// BODIES are server-rendered nodes passed in as props (TryItButton island,
// UseInAudric link card, command blocks), so this stays a thin client shell:
// open/close + tab state only.

type TabId = "try" | "agent" | "x402" | "audric";

export function UseItServiceRow({
  title,
  typeLabel,
  description,
  priceUsdc,
  tabs,
  initialTab,
}: {
  title: string;
  typeLabel: string;
  description: string | null;
  priceUsdc: string | null;
  tabs: { id: TabId; label: string; body: React.ReactNode }[];
  /** Deep link (?use=…): open the modal on this tab (one-click onboarding
   *  from the hero's three-ways card and anywhere else that links a path). */
  initialTab?: string | null;
}) {
  const deepLinked = tabs.some((t) => t.id === initialTab);
  const [open, setOpen] = useState(deepLinked);
  const [tab, setTab] = useState<TabId>(
    deepLinked ? (initialTab as TabId) : (tabs[0]?.id ?? "try")
  );
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  // Escape closes; page scroll locks while the modal is up.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div className="ag-card flex flex-col overflow-hidden">
        <div className="flex flex-1 flex-col p-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="truncate font-semibold text-[15.5px] text-foreground tracking-tight">
                {title}
              </span>
              <span className="ag-chip shrink-0 px-2 py-px text-[10px] uppercase">
                {typeLabel}
              </span>
            </div>
            <div className="shrink-0 text-right">
              {priceUsdc ? (
                <div className="font-mono text-[15px] text-foreground tabular-nums">
                  ${priceUsdc}
                </div>
              ) : (
                <div className="font-mono text-[11px] text-fg-subtle">
                  price on request
                </div>
              )}
            </div>
          </div>
          {description && (
            <p className="mt-2 line-clamp-2 min-h-[40px] text-[13px] text-muted-foreground leading-[1.5]">
              {description}
            </p>
          )}
          <div className="mt-auto flex items-center justify-between gap-3 pt-3.5">
            <span className="font-mono text-[10.5px] text-fg-subtle">
              USDC / call · from your wallet
            </span>
            <button
              className="ag-btn ag-btn--blue"
              onClick={() => setOpen(true)}
              type="button"
            >
              Use it
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div
          aria-label={`How to use ${title}`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
        >
          {/* Backdrop — click closes. */}
          <button
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
            style={{
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(2px)",
            }}
            type="button"
          />
          <div
            className="ag-card relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
            style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.55)" }}
          >
            <div
              className="flex items-start justify-between gap-4 border-b px-5 py-4"
              style={{ borderColor: "var(--ag-border)" }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="truncate font-semibold text-[16px] text-foreground tracking-tight">
                    {title}
                  </span>
                  <span className="ag-chip shrink-0 px-2 py-px text-[10px] uppercase">
                    {typeLabel}
                  </span>
                </div>
                {priceUsdc && (
                  <div className="mt-1 font-mono text-[13px] text-fg-muted tabular-nums">
                    ${priceUsdc} USDC / call · from your wallet
                  </div>
                )}
              </div>
              <button
                aria-label="Close"
                className="shrink-0 rounded-md px-2 py-1 text-fg-muted transition-colors hover:text-foreground"
                onClick={() => setOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div
                className="mb-4 inline-flex gap-1 rounded-lg p-[3px]"
                style={{ background: "var(--ag-overlay)" }}
              >
                {tabs.map((t) => (
                  <button
                    className="rounded-md px-3.5 py-1.5 font-medium text-[12.5px] transition-colors"
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={
                      tab === t.id
                        ? { background: "#fff", color: "#0a0a0a" }
                        : { color: "var(--fg-muted)" }
                    }
                    type="button"
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div>{active?.body}</div>
            </div>

            <div
              className="flex items-center gap-2 border-t px-5 py-3 text-fg-subtle text-xs"
              style={{ borderColor: "var(--ag-border)" }}
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: "var(--ag-verify)" }}
              />
              Paid from your USDC balance · escrowed, auto-refund if it
              doesn&apos;t deliver
            </div>
          </div>
        </div>
      )}
    </>
  );
}
