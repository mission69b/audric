"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// The one task board (t2000-design/agents TasksPage.jsx) — reward campaigns
// + community tasks in a single filterable card grid. Cards are compact and
// link to /tasks/[id]; the claim/submit forms live on the detail pages.

export type BoardCard = {
  id: string;
  href: string;
  kind: "reward" | "community";
  /** Filter bucket + card chip, e.g. "Sell & earn" or "research". */
  cat: string;
  title: string;
  desc: string;
  /** Mono meta line, e.g. "auto — pays on settlement · 12 left" or
   *  "6d left · 100 of 100 spots". */
  meta: string;
  rewardUsd: number;
  /** Right-hand pill: how the payout is verified. */
  badge: "Auto-verified" | "Claim-verified" | "Escrowed";
  paused?: boolean;
};

export function TaskBoard({ cards }: { cards: BoardCard[] }) {
  const cats = useMemo(() => {
    const seen: string[] = [];
    for (const c of cards) {
      if (!seen.includes(c.cat)) {
        seen.push(c.cat);
      }
    }
    return ["All", ...seen];
  }, [cards]);
  const [cat, setCat] = useState("All");
  const shown = cat === "All" ? cards : cards.filter((c) => c.cat === cat);

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            className={`ag-filter${cat === c ? " is-active" : ""}`}
            key={c}
            onClick={() => setCat(c)}
            type="button"
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-5 grid items-stretch gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr))]">
        {shown.map((t) => (
          <Link
            className="ag-card ag-card--hover flex min-h-[210px] flex-col p-5"
            href={t.href}
            key={t.id}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="ag-chip px-2 py-0.5 text-[10.5px] uppercase">{t.cat}</span>
              {t.kind === "reward" ? (
                <span
                  className="rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em]"
                  style={
                    t.paused
                      ? { borderColor: "var(--ag-border-hi)", color: "var(--fg-subtle)" }
                      : {
                          color: "var(--ag-verify)",
                          background: "var(--ag-verify-bg)",
                          borderColor: "var(--ag-verify-bd)",
                        }
                  }
                >
                  {t.paused ? "Budget spent" : "Reward"}
                </span>
              ) : (
                <span
                  className="rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em]"
                  style={{
                    color: "var(--ag-accent)",
                    background: "var(--ag-accent-bg)",
                    borderColor: "rgba(0,114,245,0.25)",
                  }}
                >
                  Open
                </span>
              )}
            </div>
            <h3 className="mt-3.5 font-semibold text-[18px] text-foreground tracking-[-0.02em]">
              {t.title}
            </h3>
            {/* Design task card: the desc is the flex-1 well — leftover card
                height becomes air INSIDE this region, meta+footer pin below. */}
            <p className="mt-2 line-clamp-3 grow text-muted-foreground text-[13.5px] leading-[1.5]">
              {t.desc}
            </p>
            <div className="mt-4 flex items-center gap-2 font-mono text-fg-subtle text-xs">
              {t.kind === "reward" ? <ShieldOutline /> : <ClockIcon />}
              {t.meta}
            </div>
            <hr className="ag-rule my-3.5" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[15px] text-foreground tabular-nums">
                {t.kind === "reward" ? "+" : ""}${t.rewardUsd.toFixed(2)}{" "}
                <span className="text-fg-subtle text-xs">USDC</span>
              </span>
              <span className="ag-verified px-2 py-0.5 text-[10px]">
                <ShieldIcon />
                {t.badge}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="mt-6 text-fg-subtle text-sm">
          Nothing in this bucket right now.
        </p>
      )}
    </>
  );
}

function ShieldOutline() {
  return (
    <svg aria-hidden="true" className="shrink-0" fill="none" height="13" viewBox="0 0 16 16" width="13">
      <path
        d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 6.9C5.1 13.1 3 10.7 3 7.5v-4l5-2z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0" fill="none" height="13" viewBox="0 0 16 16" width="13">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 5v3l2 1.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="10" viewBox="0 0 16 16" width="10">
      <path
        d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 6.9C5.1 13.1 3 10.7 3 7.5v-4l5-2z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M6 8l1.4 1.4L10.2 6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}
