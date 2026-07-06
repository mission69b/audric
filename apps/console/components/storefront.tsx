"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { CopyButton } from "@/components/copy-button";
import type { AgentRow } from "@/components/directory";
import { buildAgentPrompt } from "@/lib/agent-prompt";
import { categoryLabel } from "@/lib/categories";

// The storefront shelf (agents.t2000.ai) — services-first browsing over the
// same directory data: agents with a declared endpoint + price, joined with
// their receipt-backed sales stats (sold counts derive from on-chain
// settlement, not self-reports).

export type SellerStats = {
  sales: number;
  buyers: number;
  volumeUsd: number;
  /** Failed-delivery auto-refunds (optional until the gateway ships it). */
  refunds?: number;
  /** sales / (sales + refunds) — the receipt-backed "positive %". */
  deliveredRate?: number | null;
};

export type ServiceRow = AgentRow & { stats: SellerStats | null };

type SortKey = "featured" | "newest" | "price";

function sortServices(rows: ServiceRow[], sort: SortKey): ServiceRow[] {
  const bySales = (r: ServiceRow) => r.stats?.sales ?? 0;
  const copy = [...rows];
  switch (sort) {
    case "newest":
      return copy.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case "price":
      return copy.sort(
        (a, b) => Number(a.priceUsdc ?? 0) - Number(b.priceUsdc ?? 0)
      );
    default:
      // Featured: proven sellers first (receipt-backed sales), then newest.
      return copy.sort(
        (a, b) =>
          bySales(b) - bySales(a) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }
}

function ServiceCard({ s, featured }: { s: ServiceRow; featured?: boolean }) {
  const sold = s.stats?.sales ?? 0;
  const refunds = s.stats?.refunds ?? 0;
  return (
    // Stretched-link card (t2000-design/agents AgentCard): the overlay <Link>
    // makes the whole card clickable while the copy button sits ABOVE it
    // (z-10) — no nested interactives.
    <div className="ag-card ag-card--hover group relative flex flex-col p-[18px]">
      <Link
        aria-hidden="true"
        className="absolute inset-0 rounded-[10px]"
        href={`/${s.address}`}
        tabIndex={-1}
      />
      <div className="flex items-center gap-3">
        <AgentAvatar
          address={s.address}
          imageUrl={s.imageUrl}
          name={s.name}
          size={46}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              className="truncate font-semibold text-[15.5px] text-foreground tracking-[-0.02em]"
              href={`/${s.address}`}
            >
              {s.name}
            </Link>
            {featured && (
              <span
                className="shrink-0 rounded-md border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.04em]"
                style={{
                  color: "var(--ag-accent)",
                  background: "var(--ag-accent-bg)",
                  borderColor: "rgba(0,114,245,0.25)",
                }}
              >
                Featured
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11.5px] text-muted-foreground/60">
            {s.numericId != null && <>#{s.numericId} · </>}
            {categoryLabel(s.category ?? "other")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-medium font-mono text-[15px] text-foreground tabular-nums">
            ${s.priceUsdc}
          </div>
          <div className="mt-px font-mono text-[10.5px] text-muted-foreground/60">
            / call
          </div>
        </div>
      </div>

      <p className="mt-3.5 min-h-[60px] flex-1 text-muted-foreground text-[13.5px] leading-[1.5] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
        {s.description}
      </p>

      <hr className="ag-rule my-3.5" />

      <div className="flex items-center justify-between gap-2.5">
        {sold > 0 ? (
          <span className="ag-verified">
            <CheckIcon />
            Verified
          </span>
        ) : refunds > 0 ? (
          // Refund-only sellers are NOT a clean slate — say so.
          <span className="font-mono text-[11px] text-destructive">
            ⚠ 0 delivered · {refunds} refunded
          </span>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground/50">
            New listing
          </span>
        )}
        {sold > 0 && (
          <span className="ag-rep ag-tabular" style={{ fontSize: 12 }}>
            <span>
              <b>{sold}</b> sold
            </span>
            <span className="sep">·</span>
            <span>
              <b>{s.stats?.buyers}</b> buyers
            </span>
            {typeof s.stats?.deliveredRate === "number" && (
              <>
                <span className="sep">·</span>
                <span>
                  <b>{Math.round(s.stats.deliveredRate * 100)}%</b>
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {/* The one-hop buy affordances (OKX "USE NOW"): copy the agent prompt
          right from the grid, or open the listing. */}
      <div className="relative z-10 mt-3.5 flex items-center justify-end gap-2">
        <CopyButton
          label="Copy prompt"
          text={buildAgentPrompt({
            name: s.name,
            numericId: s.numericId,
            address: s.address,
            priceUsdc: s.priceUsdc,
            description: s.description,
          })}
        />
        <Link className="ag-btn ag-btn--ghost ag-btn--sm" href={`/${s.address}`}>
          Use it →
        </Link>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="10" viewBox="0 0 16 16" width="10">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function Storefront({ services }: { services: ServiceRow[] }) {
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("featured");

  // Only categories that actually have listings become chips (no empty chips).
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of services) {
      const c = s.category ?? "other";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [services]);

  const visible = useMemo(() => {
    const filtered =
      category === "all"
        ? services
        : services.filter((s) => (s.category ?? "other") === category);
    return sortServices(filtered, sort);
  }, [services, category, sort]);

  // FEATURED is computed, never bought: the top receipt-backed seller
  // (min 5 delivered sales) carries the flag.
  const featuredAddress = useMemo(() => {
    let best: ServiceRow | null = null;
    for (const s of services) {
      if ((s.stats?.sales ?? 0) >= 5) {
        if (!best || (s.stats?.sales ?? 0) > (best.stats?.sales ?? 0)) {
          best = s;
        }
      }
    }
    return best?.address ?? null;
  }, [services]);

  const SORTS: { id: SortKey; label: string }[] = [
    { id: "featured", label: "Featured" },
    { id: "newest", label: "Newest" },
    { id: "price", label: "Price" },
  ];

  return (
    <section className="mt-12 scroll-mt-20" id="store">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="ag-eyebrow mb-3">{"// THE STORE"}</div>
          <h2 className="ag-title" style={{ fontSize: "clamp(24px, 2.6vw, 32px)" }}>
            Agents on the job.
          </h2>
        </div>
        <p className="m-0 max-w-[340px] text-muted-foreground/70 text-sm leading-relaxed">
          Live on mainnet, sold for real. Pay per call, in cents — every sold
          count is a receipt on Sui.
        </p>
      </div>

      {services.length > 1 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            className={chipCls(category === "all")}
            onClick={() => setCategory("all")}
            type="button"
          >
            All · {services.length}
          </button>
          {categories.map(([slug, count]) => (
            <button
              className={chipCls(category === slug)}
              key={slug}
              onClick={() => setCategory(slug)}
              type="button"
            >
              {categoryLabel(slug)} · {count}
            </button>
          ))}
          <div className="ag-card ms-auto flex items-center gap-1 p-1">
            {SORTS.map((s) => (
              <button
                className={`ag-filter${sort === s.id ? " is-active" : ""}`}
                key={s.id}
                onClick={() => setSort(s.id)}
                style={{ height: 30, padding: "0 12px", fontSize: 12.5 }}
                type="button"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="ag-card mt-4 border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No services listed yet.
          </p>
          <p className="mt-1 text-muted-foreground/60 text-xs">
            Wrap any API into a paid endpoint in one command —{" "}
            <Link
              className="text-foreground underline underline-offset-4"
              href="/sell"
            >
              start selling →
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
          {visible.map((s) => (
            <ServiceCard
              featured={s.address === featuredAddress}
              key={s.address}
              s={s}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function chipCls(active: boolean): string {
  return `ag-filter${active ? " is-active" : ""}`;
}
