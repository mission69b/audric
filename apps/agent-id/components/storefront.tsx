"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import type { AgentRow } from "@/components/directory";
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

function ServiceCard({ s }: { s: ServiceRow }) {
  const sold = s.stats?.sales ?? 0;
  return (
    <Link
      className="group flex flex-col rounded-2xl border border-border/50 bg-card/40 p-5 transition-colors hover:border-border hover:bg-muted/30"
      href={`/${s.address}`}
    >
      <div className="flex items-center gap-3">
        <AgentAvatar address={s.address} imageUrl={s.imageUrl} size={40} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">
              {s.name}
            </span>
            {s.numericId != null && (
              <span className="shrink-0 font-mono text-muted-foreground/60 text-xs">
                #{s.numericId}
              </span>
            )}
          </div>
          {s.category && (
            <div className="mt-0.5 text-muted-foreground/70 text-xs">
              {categoryLabel(s.category)}
            </div>
          )}
        </div>
      </div>

      {s.description && (
        <p className="mt-3 line-clamp-2 text-muted-foreground text-sm leading-relaxed">
          {s.description}
        </p>
      )}

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div>
          <div className="font-semibold text-foreground text-lg tracking-tight">
            ${s.priceUsdc}
            <span className="ml-1 font-normal text-muted-foreground/60 text-xs">
              / call
            </span>
          </div>
          {sold > 0 ? (
            <div className="mt-0.5 text-muted-foreground/70 text-xs">
              <span className="text-emerald-500">✓</span> {sold} sold
              {typeof s.stats?.deliveredRate === "number" && (
                <> · {Math.round(s.stats.deliveredRate * 100)}% delivered</>
              )}
            </div>
          ) : (
            <div className="mt-0.5 text-muted-foreground/50 text-xs">
              New listing
            </div>
          )}
        </div>
        <span className="rounded-full border border-border/60 px-3 py-1 font-medium text-foreground text-xs transition-colors group-hover:bg-secondary">
          Use it →
        </span>
      </div>
    </Link>
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

  const SORTS: { id: SortKey; label: string }[] = [
    { id: "featured", label: "Featured" },
    { id: "newest", label: "Newest" },
    { id: "price", label: "Price" },
  ];

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-foreground text-xl tracking-tight">
          Services
        </h2>
        <span className="text-muted-foreground/60 text-xs">
          Pay per call in USDC — sold counts from on-chain settlement receipts.
        </span>
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
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <ServiceCard key={s.address} s={s} />
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
