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

export type DirectoryRow = AgentRow & {
  stats: SellerStats | null;
  /** Claimed @handle (accounts join) — Passport self-agents only. */
  handle?: string | null;
};

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

      {/* Card grid (founder 2026-07-08: match the store shelf, not a list). */}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((a, i) => {
          const selling = isSelling(a);
          const showRank = sort === "Top earners";
          const price =
            (a.servicesCount ?? 0) > 1
              ? `$${a.servicesFromUsdc ?? a.priceUsdc}+`
              : a.priceUsdc
                ? `$${a.priceUsdc}`
                : null;
          return (
            <Link
              className="ag-card ag-card--hover flex min-h-[172px] flex-col p-[18px]"
              href={`/${a.numericId ?? a.address}`}
              key={a.address}
            >
              <div className="flex items-center gap-3">
                <AgentAvatar
                  address={a.address}
                  imageUrl={a.imageUrl}
                  name={a.name}
                  size={42}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-[15px] text-foreground tracking-[-0.02em]">
                      {showRank && (
                        <span className="mr-1.5 font-mono font-normal text-fg-subtle text-xs">
                          {i + 1}.
                        </span>
                      )}
                      {a.name}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11.5px] text-fg-subtle">
                    {a.handle && <>{`${a.handle}@audric`} · </>}
                    {a.numericId != null && <>#{a.numericId} · </>}
                    {selling
                      ? categoryLabel(a.category ?? "other")
                      : shortAddress(a.address)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {price ? (
                    <>
                      <div className="font-medium font-mono text-[14.5px] text-foreground tabular-nums">
                        {price}
                      </div>
                      <div className="mt-px font-mono text-[10px] text-fg-subtle">
                        {(a.servicesCount ?? 0) > 1
                          ? `${a.servicesCount} services`
                          : "/ call"}
                      </div>
                    </>
                  ) : (
                    <span className="font-mono text-[10.5px] text-fg-subtle">
                      identity
                    </span>
                  )}
                </div>
              </div>

              {a.description && (
                <p className="mt-3 text-[13px] text-muted-foreground leading-[1.5] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                  {a.description}
                </p>
              )}

              <div className="mt-auto pt-3"><hr className="ag-rule" /></div>
              <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[11.5px] text-fg-subtle">
                {selling && (a.stats?.sales ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1.5" style={{ color: "var(--ag-verify)" }}>
                    <svg aria-hidden="true" fill="none" height="10" viewBox="0 0 16 16" width="10">
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.9"
                      />
                    </svg>
                    {a.stats?.sales} sold · {a.stats?.buyers} buyer
                    {(a.stats?.buyers ?? 0) === 1 ? "" : "s"}
                    {typeof a.stats?.deliveredRate === "number" &&
                      ` · ${Math.round(a.stats.deliveredRate * 100)}%`}
                  </span>
                ) : (
                  <span>{selling ? "no sales yet" : "identity only"}</span>
                )}
                <span>
                  {sort === "Top earners"
                    ? `$${(a.stats?.volumeUsd ?? 0).toFixed(2)} earned`
                    : formatDate(a.createdAt)}
                </span>
              </div>
            </Link>
          );
        })}
        {rows.length === 0 && (
          <div className="col-span-full px-5 py-10 text-center text-fg-subtle text-sm">
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
          <span className="text-fg-subtle text-xs">
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
