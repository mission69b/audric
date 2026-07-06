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
    <div className="group relative flex flex-col rounded-2xl border border-border/50 bg-card/40 p-[18px] transition-colors hover:border-border hover:bg-muted/30">
      <Link
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl"
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
              <span className="shrink-0 rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-px font-mono text-[10px] text-sky-400 uppercase tracking-[0.04em]">
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

      <p className="mt-3.5 min-h-[42px] flex-1 text-muted-foreground text-[13.5px] leading-normal [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
        {s.description}
      </p>

      <hr className="my-3.5 border-border/50" />

      <div className="flex items-center justify-between gap-2.5">
        {sold > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2 py-0.5 font-mono text-[10.5px] text-emerald-500">
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
          <span className="font-mono text-[12px] text-muted-foreground/70 tabular-nums">
            <b className="font-medium text-foreground">{sold}</b> sold ·{" "}
            <b className="font-medium text-foreground">{s.stats?.buyers}</b>{" "}
            buyers
            {typeof s.stats?.deliveredRate === "number" && (
              <>
                {" "}
                ·{" "}
                <b className="font-medium text-foreground">
                  {Math.round(s.stats.deliveredRate * 100)}%
                </b>
              </>
            )}
          </span>
        )}
      </div>

      {/* The one-hop buy affordances (OKX "USE NOW"): copy the agent prompt
          right from the grid, or open the listing. */}
      <div className="relative z-10 mt-3 flex items-center justify-end gap-2">
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
        <Link
          className="rounded-full border border-border/60 px-3 py-1 font-medium text-foreground text-xs transition-colors group-hover:bg-secondary"
          href={`/${s.address}`}
        >
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
          <div className="mb-2.5 font-medium font-mono text-[10.5px] text-muted-foreground/60 uppercase tracking-[0.08em]">
            {"// The store"}
          </div>
          <h2 className="font-semibold text-2xl text-foreground tracking-tight">
            Agents on the job.
          </h2>
        </div>
        <p className="m-0 max-w-[340px] text-muted-foreground/70 text-sm leading-relaxed">
          Live on mainnet, sold for real. Pay per call, in cents — every sold
          count is a receipt on Sui.
        </p>
      </div>

      {services.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
          <div className="ms-auto flex items-center gap-1 rounded-xl border border-border/60 bg-card/40 p-1">
            {SORTS.map((s) => (
              <button
                className={`rounded-lg px-2.5 py-1 font-medium text-xs transition-colors ${
                  sort === s.id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                key={s.id}
                onClick={() => setSort(s.id)}
                type="button"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border/50 border-dashed bg-card/20 p-8 text-center">
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
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
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
  return `rounded-full border px-3 py-1.5 font-medium text-xs transition-colors ${
    active
      ? "border-transparent bg-secondary text-secondary-foreground"
      : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
  }`;
}
