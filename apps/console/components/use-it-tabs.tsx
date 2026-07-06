"use client";

import { useState } from "react";

// The listing's "Use it" panel (t2000-design/agents ListingPage.jsx
// §UseItInline) — ONE service row that expands into a tabbed panel. The tab
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
}: {
  title: string;
  typeLabel: string;
  description: string | null;
  priceUsdc: string | null;
  tabs: { id: TabId; label: string; body: React.ReactNode }[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>(tabs[0]?.id ?? "try");
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="ag-card mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-5 p-5">
        <div className="min-w-[240px] flex-1">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-[16px] text-foreground tracking-tight">
              {title}
            </span>
            <span className="ag-chip px-2 py-px text-[10px] uppercase">{typeLabel}</span>
          </div>
          {description && (
            <p className="mt-2 line-clamp-2 max-w-[620px] text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3.5">
          <div className="text-right">
            {priceUsdc ? (
              <>
                <div className="font-mono text-[15px] text-foreground tabular-nums">
                  ${priceUsdc}
                </div>
                <div className="font-mono text-[10.5px] text-muted-foreground/60">
                  USDC / call · from your wallet
                </div>
              </>
            ) : (
              <div className="font-mono text-[11px] text-muted-foreground/60">
                price on request
              </div>
            )}
          </div>
          <button
            aria-expanded={open}
            className="ag-btn ag-btn--blue"
            onClick={() => setOpen((o) => !o)}
            type="button"
          >
            {open ? "Close" : "Use it"}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t p-5" style={{ background: "var(--ag-canvas)", borderColor: "var(--ag-border)" }}>
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

          <div className="mt-4 flex items-center gap-2 text-muted-foreground/60 text-xs">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--ag-verify)" }} />
            Paid from your USDC balance · escrowed, auto-refund if it
            doesn&apos;t deliver
          </div>
        </div>
      )}
    </div>
  );
}
