"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import type { AgentRow } from "@/components/directory";
import type { SellerStats } from "@/components/storefront";
import { categoryLabel } from "@/lib/categories";
import { formatDate, shortAddress } from "@/lib/format";

// The /browse registry (t2000-design/agents StoreDirectory.jsx) — ONE
// sortable list of every on-chain identity. "Top earners" is a SORT, not a
// separate section. Earnings join from the gateway's receipt-backed
// sellerStats; sorts apply within the loaded page.

export type DirectoryRow = AgentRow & { stats: SellerStats | null };

type StatusFilter = "All" | "Selling" | "Idle";
type SortKey = "Trending" | "Top earners" | "Newest";

const isSelling = (a: DirectoryRow) => Boolean(a.service && a.priceUsdc);

export function AgentDirectory({
  agents,
  total,
  offset,
  pageSize,
}: {
  agents: DirectoryRow[];
  total: number;
  offset: number;
  pageSize: number;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [sort, setSort] = useState<SortKey>("Trending");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = agents.filter((a) => {
      if (status === "Selling" && !isSelling(a)) {
        return false;
      }
      if (status === "Idle" && isSelling(a)) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        a.name.toLowerCase().includes(q) ||
        a.address.toLowerCase().includes(q) ||
        (a.numericId != null && `#${a.numericId}`.includes(q))
      );
    });
    const earned = (a: DirectoryRow) => a.stats?.volumeUsd ?? 0;
    const sales = (a: DirectoryRow) => a.stats?.sales ?? 0;
    const created = (a: DirectoryRow) => new Date(a.createdAt).getTime();
    if (sort === "Top earners") {
      r = [...r].sort((a, b) => earned(b) - earned(a));
    } else if (sort === "Newest") {
      r = [...r].sort((a, b) => created(b) - created(a));
    } else {
      // Trending: receipt-backed sales first, then newest.
      r = [...r].sort((a, b) => sales(b) - sales(a) || created(b) - created(a));
    }
    return r;
  }, [agents, query, status, sort]);

  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;
  const filtering = Boolean(query) || status !== "All";

  return (
    <>
      {/* controls: search + status filter + sort */}
      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          className="ag-input h-11 flex-1"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, address, or #id…"
          type="search"
          value={query}
        />
        <div className="flex shrink-0 items-center gap-2">
          <Segmented
            active={status}
            onPick={(v) => setStatus(v)}
            options={["All", "Selling", "Idle"] as const}
          />
          <Segmented
            active={sort}
            onPick={(v) => setSort(v)}
            options={["Trending", "Top earners", "Newest"] as const}
          />
        </div>
      </div>

      <div className="ag-card mt-5 divide-y divide-border/50 overflow-hidden">
        {rows.map((a, i) => {
          const selling = isSelling(a);
          const showRank = sort === "Top earners";
          return (
            <Link
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[color:var(--ag-overlay)]"
              href={`/${a.address}`}
              key={a.address}
            >
              {showRank && (
                <span className="w-5 shrink-0 text-right font-mono text-muted-foreground/50 text-sm tabular-nums">
                  {i + 1}
                </span>
              )}
              <AgentAvatar
                address={a.address}
                imageUrl={a.imageUrl}
                name={a.name}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[15px] text-foreground">
                    {a.name}
                  </span>
                  {a.numericId != null && (
                    <span className="font-mono text-muted-foreground/60 text-xs">
                      #{a.numericId}
                    </span>
                  )}
                  <span
                    className={`ag-chip px-2 py-px text-[10px] uppercase ${
                      selling ? "" : "opacity-60"
                    }`}
                  >
                    {selling
                      ? categoryLabel(a.category ?? "other")
                      : "Not selling"}
                  </span>
                </div>
                {a.description && (
                  <div className="mt-1 max-w-[420px] truncate text-muted-foreground text-sm">
                    {a.description}
                  </div>
                )}
                <div className="mt-1 font-mono text-muted-foreground/50 text-xs">
                  {shortAddress(a.address)}
                </div>
              </div>

              {/* reputation column */}
              <div className="hidden shrink-0 text-right sm:block">
                {selling && (a.stats?.sales ?? 0) > 0 ? (
                  <>
                    <div className="font-mono text-muted-foreground/70 text-xs">
                      {a.stats?.sales} sold · {a.stats?.buyers} buyer
                      {(a.stats?.buyers ?? 0) === 1 ? "" : "s"}
                    </div>
                    {typeof a.stats?.deliveredRate === "number" && (
                      <div className="mt-1 inline-flex items-center gap-1 font-mono text-xs" style={{ color: "var(--ag-verify)" }}>
                        <svg
                          aria-hidden="true"
                          fill="none"
                          height="10"
                          viewBox="0 0 16 16"
                          width="10"
                        >
                          <path
                            d="M3.5 8.5l3 3 6-7"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.9"
                          />
                        </svg>
                        {Math.round(a.stats.deliveredRate * 100)}% delivered
                      </div>
                    )}
                  </>
                ) : (
                  <span className="font-mono text-muted-foreground/50 text-xs">
                    {selling ? "no sales yet" : "identity only"}
                  </span>
                )}
              </div>

              {/* metric column changes with sort */}
              {sort === "Newest" ? (
                <span className="w-24 shrink-0 text-right font-mono text-muted-foreground/60 text-xs">
                  {formatDate(a.createdAt)}
                </span>
              ) : sort === "Top earners" ? (
                <span className="w-[84px] shrink-0 text-right font-mono text-[15px] text-foreground tabular-nums">
                  ${(a.stats?.volumeUsd ?? 0).toFixed(4)}
                </span>
              ) : (
                <span
                  className={`w-16 shrink-0 text-right font-mono text-sm tabular-nums ${
                    a.priceUsdc
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  {a.priceUsdc ? `$${a.priceUsdc}` : "—"}
                </span>
              )}
            </Link>
          );
        })}
        {rows.length === 0 && (
          <div className="px-5 py-10 text-center text-muted-foreground/60 text-sm">
            No agents match{query ? ` “${query}”` : " that filter"}.
          </div>
        )}
      </div>

      {/* pagination — server-side pages; sorting applies within the page */}
      {!filtering && (hasPrev || hasNext) && (
        <div className="mt-5 flex items-center justify-between text-sm">
          {hasPrev ? (
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href={`/browse?offset=${Math.max(offset - pageSize, 0)}`}
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground/50 text-xs">
            {offset + 1}–{Math.min(offset + pageSize, total)} of {total}
          </span>
          {hasNext ? (
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href={`/browse?offset=${offset + pageSize}`}
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}

function Segmented<T extends string>({
  options,
  active,
  onPick,
}: {
  options: readonly T[];
  active: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="ag-card flex items-center gap-1 p-1">
      {options.map((o) => (
        <button
          className={`ag-filter${active === o ? " is-active" : ""}`}
          key={o}
          onClick={() => onPick(o)}
          style={{ height: 30, padding: "0 12px", fontSize: 12.5 }}
          type="button"
        >
          {o}
        </button>
      ))}
    </div>
  );
}
