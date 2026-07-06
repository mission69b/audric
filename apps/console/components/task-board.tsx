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
            className={`rounded-full border px-3.5 py-1.5 font-medium text-[13px] transition-colors ${
              cat === c
                ? "border-transparent bg-foreground text-background"
                : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
            }`}
            key={c}
            onClick={() => setCat(c)}
            type="button"
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-5 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <Link
            className="flex min-h-[210px] flex-col rounded-2xl border border-border/50 bg-card/40 p-5 transition-colors hover:border-border hover:bg-muted/30"
            href={t.href}
            key={t.id}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.04em]">
                {t.cat}
              </span>
              {t.kind === "reward" ? (
                <span
                  className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] ${
                    t.paused
                      ? "border-border/60 text-muted-foreground/60"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  }`}
                >
                  {t.paused ? "Budget spent" : "Reward"}
                </span>
              ) : (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] text-sky-500 uppercase tracking-[0.04em]">
                  Open
                </span>
              )}
            </div>
            <h3 className="mt-3.5 font-semibold text-[17px] text-foreground tracking-[-0.02em]">
              {t.title}
            </h3>
            <p className="mt-2 line-clamp-3 flex-1 text-muted-foreground text-sm leading-relaxed">
              {t.desc}
            </p>
            <div className="mt-4 font-mono text-muted-foreground/60 text-xs">
              {t.meta}
            </div>
            <hr className="my-3.5 border-border/50" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[15px] text-foreground tabular-nums">
                {t.kind === "reward" ? "+" : ""}${t.rewardUsd.toFixed(2)}{" "}
                <span className="text-muted-foreground/60 text-xs">USDC</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2 py-0.5 font-mono text-[10px] text-emerald-500/90">
                <ShieldIcon />
                {t.badge}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="mt-6 text-muted-foreground/60 text-sm">
          Nothing in this bucket right now.
        </p>
      )}
    </>
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
