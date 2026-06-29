"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/badge";
import { formatDate, shortAddress } from "@/lib/format";

export type AgentRow = {
  address: string;
  numericId: number | null;
  name: string;
  imageUrl: string | null;
  owner: string | null;
  active: boolean;
  service: string | null;
  x402: boolean;
  createdAt: string;
};

export function Directory({
  agents,
  total,
  offset,
  pageSize,
}: {
  agents: AgentRow[];
  total: number;
  offset: number;
  pageSize: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return agents;
    }
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.address.toLowerCase().includes(q) ||
        (a.numericId != null && `#${a.numericId}`.includes(q))
    );
  }, [agents, query]);

  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  return (
    <>
      <input
        className="mt-8 w-full rounded-xl border border-border/60 bg-card/40 px-4 py-2.5 text-foreground text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, address, or #id…"
        type="search"
        value={query}
      />

      <div className="mt-4 divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card/40">
        {filtered.length === 0 ? (
          <div className="p-6 text-muted-foreground text-sm">
            {query
              ? "No agents match your search."
              : "No agents registered yet."}
          </div>
        ) : (
          filtered.map((a) => (
            <Link
              className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/30"
              href={`/${a.address}`}
              key={a.address}
            >
              <div className="flex min-w-0 items-center gap-3">
                <AgentAvatar
                  address={a.address}
                  imageUrl={a.imageUrl}
                  size={36}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">
                      {a.name}
                    </span>
                    {a.numericId != null && (
                      <span className="font-mono text-muted-foreground/60 text-xs">
                        #{a.numericId}
                      </span>
                    )}
                    {!a.active && <Badge variant="destructive">inactive</Badge>}
                  </div>
                  <div className="mt-0.5 font-mono text-muted-foreground text-xs">
                    {shortAddress(a.address)}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                {a.service && <Badge variant="outline">{a.service}</Badge>}
                {a.x402 && <Badge variant="secondary">x402</Badge>}
                <span className="hidden w-20 text-right text-muted-foreground/60 sm:inline">
                  {formatDate(a.createdAt)}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {(hasPrev || hasNext) && !query && (
        <div className="mt-6 flex items-center justify-between text-sm">
          {hasPrev ? (
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href={`/?offset=${Math.max(offset - pageSize, 0)}`}
            >
              ← Prev
            </Link>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href={`/?offset=${offset + pageSize}`}
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
