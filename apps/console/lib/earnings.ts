import { getAgentProfile, listAgentsForOwner } from "@audric/accounts";
import { fetchRetry } from "@/lib/fetch-retry";

// Receipt-backed earnings rollup for a signed-in Passport — the self-agent
// plus every confirmed owned agent, with each agent's public reputation
// (on-chain settlement receipts via the public API). Shared by Overview +
// Earnings so the numbers can never drift.

const API_BASE = "https://api.t2000.ai/v1";

export type Reputation = {
  sales: number;
  volumeUsd: number;
  buyers: number;
  refunds?: number;
  deliveredRate?: number | null;
  lastSaleAt: string | null;
  recent?: {
    at: string;
    buyer: string;
    amountUsd: number;
    delivered: boolean;
    tx?: string;
  }[];
};

export type AgentEarnings = {
  address: string;
  name: string;
  numericId: number | null;
  imageUrl: string | null;
  selling: boolean;
  rep: Reputation | null;
};

async function fetchReputation(address: string): Promise<Reputation | null> {
  try {
    const res = await fetchRetry(`${API_BASE}/agents/${address}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { reputation?: Reputation };
    return data.reputation ?? null;
  } catch {
    return null;
  }
}

export async function fetchMyEarnings(userId: string): Promise<{
  rows: AgentEarnings[];
  totalEarned: number;
  totalSales: number;
  totalBuyers: number;
  activeListings: number;
  recent: (NonNullable<Reputation["recent"]>[number] & { agent: string })[];
}> {
  const [{ owned }, selfAgent] = await Promise.all([
    listAgentsForOwner(userId),
    getAgentProfile(userId),
  ]);
  const all = [
    ...(selfAgent ? [selfAgent] : []),
    ...owned.filter((a) => a.address !== selfAgent?.address),
  ];

  const reps = await Promise.all(all.map((a) => fetchReputation(a.address)));
  const rows: AgentEarnings[] = all.map((a, i) => ({
    address: a.address,
    name: a.displayName || a.name,
    numericId: a.numericId ?? null,
    imageUrl: a.imageUrl ?? null,
    selling: Boolean(a.mcpEndpoint && a.active),
    rep: reps[i],
  }));

  return {
    rows,
    totalEarned: rows.reduce((s, r) => s + (r.rep?.volumeUsd ?? 0), 0),
    totalSales: rows.reduce((s, r) => s + (r.rep?.sales ?? 0), 0),
    totalBuyers: rows.reduce((s, r) => s + (r.rep?.buyers ?? 0), 0),
    activeListings: rows.filter((r) => r.selling).length,
    recent: rows
      .flatMap((r) =>
        (r.rep?.recent ?? []).map((s) => ({ ...s, agent: r.name }))
      )
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 12),
  };
}
