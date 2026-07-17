import { getUsernamesByIds } from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import type { StoreRow } from "@/components/store-grid";
import { fetchRetry } from "@/lib/fetch-retry";
import {
  fetchGatewayServices,
  fetchServiceStats,
  type GatewayService,
  priceFloor,
  type ServiceStats,
} from "@/lib/gateway-services";

// Row assembly shared by the store homepage (sellers only) and the /agents
// directory (everyone). One builder so the two surfaces can never disagree
// about what an agent sells or what its receipts say.
const API_BASE = "https://api.t2000.ai/v1";

export type AgentRow = {
  address: string;
  numericId?: number | null;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  mcpEndpoint?: string | null;
};

export type Seller = GatewayService & { payTo: string };

export async function fetchAgents(): Promise<{
  total: number;
  agents: AgentRow[];
}> {
  try {
    const res = await fetchRetry(`${API_BASE}/agents?limit=100&offset=0`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        total?: number;
        agents?: AgentRow[];
      };
      return { total: data.total ?? 0, agents: data.agents ?? [] };
    }
  } catch {
    // directory unavailable — callers render the empty state
  }
  return { total: 0, agents: [] };
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Selling agents first (receipts-sorted), then unclaimed sellers, then the
 *  rest of the directory. `verified` = claimed wallet + ≥1 settled sale. */
export function buildRows(
  agents: AgentRow[],
  sellers: Seller[],
  handles: Map<string, string>,
  statsById: Map<string, ServiceStats | null>
): StoreRow[] {
  const serviceByWallet = new Map(
    sellers.map((s) => [s.payTo.toLowerCase(), s])
  );
  const agentWallets = new Set(agents.map((a) => a.address.toLowerCase()));

  const rows: StoreRow[] = agents.map((a) => {
    const service = serviceByWallet.get(a.address.toLowerCase());
    const stats = service ? statsById.get(service.id) : undefined;
    const handle = handles.get(a.address);
    return {
      key: a.address,
      href: `/${a.numericId ?? a.address}`,
      name: a.name,
      sub: `${handle ? `${displayHandle(handle)} · ` : ""}#${a.numericId ?? "—"}`,
      description:
        service?.description ??
        a.description?.split("\n")[0] ??
        "No description yet.",
      address: a.address,
      imageUrl: a.imageUrl,
      category: a.category ?? null,
      price: service ? priceFloor(service) : null,
      perJob: Boolean(service?.escrow),
      verified: Boolean(stats && stats.sold > 0),
      sold: stats?.sold,
      buyers: stats?.buyers,
    };
  });

  // Sellers whose payTo isn't a registered agent — still real listings.
  for (const s of sellers) {
    const wallet = s.payTo.toLowerCase();
    if (agentWallets.has(wallet)) {
      continue;
    }
    const stats = statsById.get(s.id);
    rows.push({
      key: s.id,
      href: `/${s.payTo}`,
      name: s.name,
      sub: shortAddress(s.payTo),
      description: s.description,
      address: s.payTo,
      category: null,
      price: priceFloor(s),
      perJob: Boolean(s.escrow),
      // Verified requires a CLAIMED wallet (registered Agent ID) + sales.
      verified: false,
      sold: stats?.sold,
      buyers: stats?.buyers,
    });
  }

  rows.sort((a, b) => {
    const soldDiff = (b.sold ?? 0) - (a.sold ?? 0);
    if (soldDiff !== 0) {
      return soldDiff;
    }
    return (b.price ? 1 : 0) - (a.price ? 1 : 0);
  });
  if (rows[0] && (rows[0].sold ?? 0) > 0) {
    rows[0].featured = true;
  }
  return rows;
}

/** One-call assembly used by both store surfaces. */
export async function loadStoreData(): Promise<{
  total: number;
  rows: StoreRow[];
  sellers: Seller[];
  servicesCount: number;
  statsById: Map<string, ServiceStats | null>;
}> {
  const [{ total, agents }, services] = await Promise.all([
    fetchAgents(),
    fetchGatewayServices(),
  ]);
  // The store showcases the AGENT economy only: direct sellers whose 402
  // pays their own wallet (founder call 2026-07-17 late: the rail's proxied
  // vendor catalog stays on mpp.t2000.ai/services — listing it here reads
  // as a reseller catalog and dilutes the A2A story). flatMap so the
  // narrowed `payTo` survives the filter for TypeScript.
  const sellers: Seller[] = services.flatMap((s) =>
    s.direct && s.payTo ? [{ ...s, payTo: s.payTo }] : []
  );
  const [handles, statsList] = await Promise.all([
    getUsernamesByIds(agents.map((a) => a.address)).catch(
      () => new Map<string, string>()
    ),
    Promise.all(sellers.map((s) => fetchServiceStats(s.id))),
  ]);
  const statsById = new Map<string, ServiceStats | null>(
    sellers.map((s, i) => [s.id, statsList[i]])
  );
  return {
    total,
    rows: buildRows(agents, sellers, handles, statsById),
    sellers,
    servicesCount: services.length,
    statsById,
  };
}
