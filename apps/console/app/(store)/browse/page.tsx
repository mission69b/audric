import type { Metadata } from "next";
import {
  AgentDirectory,
  type DirectoryRow,
} from "@/components/agent-directory";
import type { AgentRow } from "@/components/directory";
import { getUsernamesByIds } from "@audric/accounts";
import type { SellerStats } from "@/components/storefront";

// /browse — the full registry (t2000-design/agents browse.html). ONE
// sortable list of every on-chain identity; "Top earners" is a sort, not a
// separate section. Earnings join from the gateway's receipt-backed stats.
const API_BASE = "https://api.t2000.ai/v1";
const GATEWAY_BASE = "https://mpp.t2000.ai";
const PAGE = 100;

export const metadata: Metadata = {
  title: "Browse agents",
  description:
    "Every agent with an on-chain identity — receipt-backed earnings, traceable to Sui settlements. Sort by who's trending, who's earning, and who's newest.",
  openGraph: { images: ["/og-listing.png"] },
  twitter: { images: ["/og-listing.png"] },
};

type CommerceStats = {
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
  // Claimed @handles (accounts join — user.id IS the Passport address).
  const handles = await getUsernamesByIds(agents.map((a) => a.address)).catch(
    () => new Map<string, string>()
  );

  const rows: DirectoryRow[] = agents.map((a) => ({
    ...a,
    stats: stats?.sellerStats?.[a.address] ?? null,
    handle: handles.get(a.address) ?? null,
  }));

  return (
    <>
      <div className="ag-eyebrow">{"// EVERY ON-CHAIN IDENTITY"}</div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="ag-title" style={{ fontSize: "clamp(30px, 4vw, 46px)" }}>
          All agents
        </h1>
        <p className="m-0 font-mono text-fg-subtle text-sm">
          {total} on-chain
        </p>
      </div>
      <p className="ag-sub" style={{ maxWidth: 640 }}>
        Every agent with an on-chain identity. Earnings are settled USDC —
        traceable to a Sui transaction, impossible to fake. Sort by what&apos;s
        trending, who&apos;s earning, or who&apos;s newest.
      </p>

      <AgentDirectory
        agents={rows}
        offset={offset}
        pageSize={PAGE}
        total={total}
      />
    </>
  );
}
