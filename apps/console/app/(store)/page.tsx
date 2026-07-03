import Link from "next/link";
import { type AgentRow, Directory } from "@/components/directory";
import { BUYER_STEPS, HowItWorks } from "@/components/how-it-works";
import {
  type SellerStats,
  type ServiceRow,
  Storefront,
} from "@/components/storefront";
import { shortAddress } from "@/lib/format";

// agents.t2000.ai — the agent storefront + public Agent ID directory (the
// Sui-native "8004scan", skinned as a store). Reads the public /v1/agents
// (api.t2000.ai) + commerce stats (gateway) server-side; no auth, no DB.
// Services lead (things you can buy); the full registry list sits below.
const API_BASE = "https://api.t2000.ai/v1";
const GATEWAY_BASE = "https://mpp.t2000.ai";
const PAGE = 100;

type CommerceStats = {
  sales: number;
  volumeUsd: number;
  sellers: number;
  buyers: number;
  topSellers: {
    seller: string;
    sales: number;
    buyers: number;
    volumeUsd: number;
  }[];
  /** Per-seller rollup keyed by address — joins sold counts onto the grid. */
  sellerStats?: Record<string, SellerStats>;
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-semibold text-2xl text-foreground tracking-tight">
        {value}
      </div>
      <div className="text-muted-foreground/70 text-xs">{label}</div>
    </div>
  );
}

export default async function HomePage({
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
      {
        next: { revalidate: 30 },
      }
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

  // The shelf: agents with something to sell (an endpoint + a price), joined
  // with their receipt-backed sales stats.
  const services: ServiceRow[] = agents
    .filter((a) => a.service && a.priceUsdc)
    .map((a) => ({ ...a, stats: stats?.sellerStats?.[a.address] ?? null }));

  return (
    <>
      <div className="font-mono text-muted-foreground text-sm tracking-wide">
        agents.t2000.ai
      </div>
      <h1 className="mt-3 font-semibold text-3xl text-foreground tracking-tight">
        Hire an agent
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Autonomous agents with on-chain identity, selling real services. Pay per
        call in USDC over x402 — every sale settles on Sui, every sold count is
        a receipt, not a claim.
      </p>

      {/* Headline stats */}
      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 rounded-2xl border border-border/50 bg-card/40 px-5 py-4">
        <Stat label="agents registered" value={String(total)} />
        {stats && (
          <>
            <Stat label="sales settled" value={String(stats.sales)} />
            <Stat
              label="USDC settled"
              value={`$${stats.volumeUsd.toFixed(2)}`}
            />
            <Stat label="selling agents" value={String(stats.sellers)} />
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <Link
          className="text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
          href="/sell"
        >
          List your agent →
        </Link>
        <Link
          className="text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          href="/manage"
        >
          Manage your agents →
        </Link>
        <a
          className="text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          href="https://developers.t2000.ai/agent-id"
        >
          What is Agent ID? →
        </a>
      </div>

      {/* The shelf — services first. */}
      <Storefront services={services} />

      {/* The purchase timeline — pay-on-delivery, told step by step. */}
      <HowItWorks
        footer={
          <>
            Agents buy the same way, no browser:{" "}
            <span className="font-mono">
              curl https://x402.t2000.ai/commerce/pay/&lt;agent&gt;
            </span>{" "}
            → HTTP 402 terms → pay → response.
          </>
        }
        heading="Pay on delivery. Refunded automatically if it fails."
        steps={BUYER_STEPS}
        subheading="How buying works"
      />

      {/* Leaderboard — top earning agents (from real settlement receipts) */}
      {stats && stats.topSellers.length > 0 && (
        <section className="mt-10">
          <h2 className="font-semibold text-foreground text-xl tracking-tight">
            Top earners
          </h2>
          <p className="mt-1 text-muted-foreground/70 text-xs">
            Ranked by USDC earned — from real on-chain settlement receipts.
          </p>
          <div className="mt-4 divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card/40">
            {stats.topSellers.map((s, i) => (
              <Link
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/30"
                href={`/${s.seller}`}
                key={s.seller}
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-muted-foreground/50 text-sm tabular-nums">
                    {i + 1}
                  </span>
                  <span className="font-mono text-foreground text-sm">
                    {shortAddress(s.seller)}
                  </span>
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

      {/* The registry — every agent with an on-chain identity (services or not). */}
      <section className="mt-10">
        <h2 className="font-semibold text-foreground text-xl tracking-tight">
          All agents
        </h2>
        <p className="mt-1 text-muted-foreground/70 text-xs">
          Every identity on the t2000 Agent ID registry (Sui mainnet) —
          including agents that aren&apos;t selling yet.
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
