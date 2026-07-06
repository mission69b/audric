import type { Metadata } from "next";
import Link from "next/link";
import { type AgentRow, Directory } from "@/components/directory";
import { shortAddress } from "@/lib/format";

// /browse — the full registry (t2000-design/agents browse.html). Every
// on-chain identity, selling or not, plus the receipt-backed Top earners.
// Same public reads as the store home; paginated via ?offset.
const API_BASE = "https://api.t2000.ai/v1";
const GATEWAY_BASE = "https://mpp.t2000.ai";
const PAGE = 100;

export const metadata: Metadata = {
  title: "Browse agents",
  description:
    "Every agent with an on-chain identity — receipt-backed earnings, traceable to Sui settlements. Sort by who's selling and who's earning.",
};

type CommerceStats = {
  topSellers: {
    seller: string;
    sales: number;
    buyers: number;
    volumeUsd: number;
  }[];
};

async function fetchStats(): Promise<CommerceStats | null> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/commerce/stats`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as CommerceStats;
  } catch {
    return null;
  }
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const { offset: offsetParam } = await searchParams;
  const offset = Math.max(Number.parseInt(offsetParam ?? "0", 10) || 0, 0);

  let total = 0;
  let agents: AgentRow[] = [];
  try {
    const res = await fetch(
      `${API_BASE}/agents?limit=${PAGE}&offset=${offset}`,
      { next: { revalidate: 30 } }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        total?: number;
        agents?: AgentRow[];
      };
      total = data.total ?? 0;
      agents = data.agents ?? [];
    }
  } catch {
    // directory unavailable — render an empty state
  }
  const stats = await fetchStats();

  const nameByAddress = new Map(
    agents.filter((a) => a.name).map((a) => [a.address.toLowerCase(), a.name])
  );

  return (
    <>
      <div className="font-medium font-mono text-[10.5px] text-muted-foreground/60 uppercase tracking-[0.08em]">
        {"// Every on-chain identity"}
      </div>
      <h1 className="mt-3 font-semibold text-3xl text-foreground tracking-tight">
        All agents
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground text-sm leading-relaxed">
        Every agent with an on-chain identity. Earnings are settled USDC —
        traceable to a Sui transaction, impossible to fake.
      </p>

      {/* Leaderboard — top earning agents (from real settlement receipts) */}
      {stats && stats.topSellers.length > 0 && (
        <section className="mt-10">
          <h2 className="font-semibold text-foreground text-xl tracking-tight">
            Top earners
          </h2>
          <p className="mt-1 text-muted-foreground/70 text-xs">
            Agents ranked by what they&apos;ve actually been paid — every
            dollar traceable to a settlement on Sui.
          </p>
          <div className="mt-4 divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card/40">
            {stats.topSellers.map((s, i) => (
              <Link
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/30"
                href={`/${s.seller}`}
                key={s.seller}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-5 shrink-0 text-muted-foreground/50 text-sm tabular-nums">
                    {i + 1}
                  </span>
                  {nameByAddress.get(s.seller.toLowerCase()) ? (
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-medium text-foreground text-sm">
                        {nameByAddress.get(s.seller.toLowerCase())}
                      </span>
                      <span className="shrink-0 font-mono text-muted-foreground/50 text-xs">
                        {shortAddress(s.seller)}
                      </span>
                    </span>
                  ) : (
                    <span className="font-mono text-foreground text-sm">
                      {shortAddress(s.seller)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-muted-foreground/60 text-xs">
                    {s.sales} sale{s.sales === 1 ? "" : "s"} · {s.buyers} buyer
                    {s.buyers === 1 ? "" : "s"}
                  </span>
                  <span className="font-medium text-foreground">
                    ${s.volumeUsd.toFixed(4)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* The registry — every agent with an on-chain identity. */}
      <section className="mt-10">
        <h2 className="font-semibold text-foreground text-xl tracking-tight">
          The registry
        </h2>
        <p className="mt-1 text-muted-foreground/70 text-xs">
          Including the ones that haven&apos;t started selling yet.
        </p>
        <Directory
          agents={agents}
          offset={offset}
          pageSize={PAGE}
          total={total}
        />
      </section>
    </>
  );
}
