"use client";

import Link from "next/link";
import { useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { categoryLabel } from "@/lib/categories";

// The store grid (t2000-design/agents AgentCard, restored 2026-07-18):
// one unified grid of selling agents + the directory, filterable by
// category. Every stat on a card is receipts-derived (payment ledger) —
// the server assembles the rows; this island only filters and renders.

export type StoreRow = {
  key: string;
  href: string;
  name: string;
  /** `@handle · #id` for registered agents, short wallet for unclaimed. */
  sub: string;
  description: string;
  address: string;
  imageUrl?: string | null;
  category?: string | null;
  /** Cheapest endpoint as `$X` — absent for non-selling directory agents. */
  price?: string | null;
  /** Job-class listing: price is per JOB (escrowed), not per call. */
  perJob?: boolean;
  /** Claimed (registered Agent ID) + at least one settled sale. */
  verified: boolean;
  sold?: number;
  buyers?: number;
  featured?: boolean;
};

export function StoreGrid({ rows }: { rows: StoreRow[] }) {
  const [active, setActive] = useState<string>("all");
  const categories = Array.from(
    new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))
  );
  const visible =
    active === "all" ? rows : rows.filter((r) => r.category === active);

  return (
    <>
      {categories.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {["all", ...categories].map((slug) => (
            <button
              className={`ag-filter${active === slug ? " is-active" : ""}`}
              key={slug}
              onClick={() => setActive(slug)}
              type="button"
            >
              {slug === "all" ? "All" : categoryLabel(slug)}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((r) => (
          <Link
            className="ag-card group flex flex-col gap-3 p-5 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30"
            href={r.href}
            key={r.key}
          >
            <div className="flex items-start gap-3">
              <AgentAvatar
                address={r.address}
                imageUrl={r.imageUrl ?? undefined}
                name={r.name}
                size={42}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-[15px] text-foreground tracking-[-0.014em]">
                    {r.name}
                  </span>
                  {r.featured && (
                    <span
                      className="shrink-0 rounded px-1.5 py-px font-medium font-mono text-[9px] uppercase tracking-[0.08em]"
                      style={{
                        color: "var(--ag-accent)",
                        background: "var(--ag-accent-bg)",
                      }}
                    >
                      Featured
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">
                  {r.sub}
                </div>
              </div>
              {r.price && (
                <div className="shrink-0 text-right">
                  <div className="font-mono font-semibold text-[14px] text-foreground">
                    {r.price}
                  </div>
                  <div className="font-mono text-[10px] text-fg-subtle">
                    {r.perJob ? "/ job" : "/ call"}
                  </div>
                </div>
              )}
            </div>
            <p className="m-0 line-clamp-2 min-h-[2.6em] text-[12.5px] text-fg-muted leading-relaxed">
              {r.description}
            </p>
            <div
              className="mt-auto flex items-center gap-2 border-t pt-3"
              style={{ borderColor: "var(--ag-border)" }}
            >
              {r.verified ? (
                <span className="ag-verified">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="11"
                    viewBox="0 0 24 24"
                    width="11"
                  >
                    <path
                      d="M20 6 9 17l-5-5"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                    />
                  </svg>
                  Verified
                </span>
              ) : r.category ? (
                <span
                  className="rounded-md border px-2 py-0.5 text-[11px] text-fg-muted"
                  style={{ borderColor: "var(--ag-border)" }}
                >
                  {categoryLabel(r.category)}
                </span>
              ) : (
                <span className="text-[11px] text-fg-subtle">New listing</span>
              )}
              <span className="ml-auto font-mono text-[11.5px] text-fg-muted">
                {typeof r.sold === "number" && r.sold > 0 ? (
                  <>
                    <b className="font-medium text-foreground">{r.sold}</b> sold
                    {typeof r.buyers === "number" && r.buyers > 0 && (
                      <>
                        {" · "}
                        <b className="font-medium text-foreground">
                          {r.buyers}
                        </b>{" "}
                        {r.buyers === 1 ? "buyer" : "buyers"}
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-fg-subtle transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                )}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="ag-card mt-4 px-4 py-8 text-center text-fg-subtle text-sm">
          Nothing in this category yet.
        </div>
      )}
    </>
  );
}
