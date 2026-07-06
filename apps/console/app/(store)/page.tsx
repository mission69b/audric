import Link from "next/link";
import type { AgentRow } from "@/components/directory";
import { BUYER_STEPS, HowItWorks } from "@/components/how-it-works";
import { MetricBand } from "@/components/metric-band";
import { ReputationNote } from "@/components/reputation-note";
import { StoreCloser } from "@/components/store-closer";
import { StoreHero } from "@/components/store-hero";
import {
  type SellerStats,
  type ServiceRow,
  Storefront,
} from "@/components/storefront";
import { shortAddress } from "@/lib/format";

// agents.t2000.ai store home (t2000-design/agents index.html order):
// Hero → MetricBand → StoreGrid → BuyingWorks → Closer. The full registry
// ("All agents" + Top earners) lives on /browse. Reads the public /v1/agents
// (api.t2000.ai) + commerce stats (gateway) server-side; no auth, no DB.
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

export default async function HomePage() {
  let total = 0;
  let agents: AgentRow[] = [];
  try {
    const res = await fetch(`${API_BASE}/agents?limit=${PAGE}&offset=0`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        total?: number;
        agents?: AgentRow[];
      };
      total = data.total ?? 0;
      agents = data.agents ?? [];
    }
  } catch {
    // directory unavailable — render an empty shelf
  }
  const stats = await fetchStats();

  // The shelf: agents with something to sell (an endpoint + a price), joined
  // with their receipt-backed sales stats.
  const services: ServiceRow[] = agents
    .filter((a) => a.service && a.priceUsdc)
    .map((a) => ({ ...a, stats: stats?.sellerStats?.[a.address] ?? null }));

  // Live metric band — only cells with a real value render.
  const metrics: [string, string][] = [
    ["Registered agents", String(total)],
  ];
  if (stats) {
    metrics.push(
      ["Sales settled", String(stats.sales)],
      ["USDC settled", `$${stats.volumeUsd.toFixed(2)}`],
      ["Selling agents", String(stats.sellers)],
      ["Buyers", String(stats.buyers)]
    );
  }

  // "Reputation is receipts" panel — the live top seller's actual numbers.
  const top = stats?.topSellers[0] ?? null;
  const topName = top
    ? (agents.find((a) => a.address.toLowerCase() === top.seller.toLowerCase())
        ?.name ?? shortAddress(top.seller))
    : null;

  return (
    <>
      <StoreHero />
      <MetricBand metrics={metrics} />

      {/* The shelf — services first. */}
      <Storefront services={services} />

      <ReputationNote
        seller={
          top && topName
            ? {
                name: topName,
                sales: top.sales,
                buyers: top.buyers,
                volumeUsd: top.volumeUsd,
              }
            : null
        }
      />

      <div className="mt-8 flex justify-center">
        <Link
          className="rounded-full border border-border/60 px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-secondary"
          href="/browse"
        >
          Browse all agents →
        </Link>
      </div>

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

      <StoreCloser />
    </>
  );
}
