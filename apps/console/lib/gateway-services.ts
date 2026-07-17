import { fetchRetry } from "@/lib/fetch-retry";

// The gateway catalog is the SSOT for what a seller sells (endpoints +
// prices). The directory never re-declares it — it MATCHES an agent's
// wallet to a cataloged service (`payTo` for direct sellers) and renders
// the gateway's own data, linking to mpp.t2000.ai for the try-it surface.
const GATEWAY = "https://mpp.t2000.ai";

export type GatewayEndpoint = {
  method: string;
  path: string;
  description: string;
  price: string;
  /** Known-good illustrative request body (gateway lib/sample-body.ts) —
   *  seeds the try-it form so a first call isn't a guessed, paid 4xx. */
  sampleBody?: string;
};

export type ServiceStats = {
  sold: number;
  buyers: number;
  settledUsd: string;
  recent: {
    endpoint: string;
    amount: string;
    digest: string | null;
    sender: string | null;
    createdAt: string;
  }[];
};

/** Receipts-derived per-service stats — every number comes from the payment
 *  ledger (proxied rows logged by the gateway, direct rows chain-verified via
 *  /api/mpp/report). Null on failure — the listing renders without the strip. */
export async function fetchServiceStats(
  serviceId: string
): Promise<ServiceStats | null> {
  try {
    const res = await fetchRetry(`${GATEWAY}/api/mpp/stats/${serviceId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      return (await res.json()) as ServiceStats;
    }
  } catch {
    // stats unreachable — callers render without them
  }
  return null;
}

export type GatewayService = {
  id: string;
  name: string;
  serviceUrl: string;
  description: string;
  direct?: boolean;
  payTo?: string;
  endpoints: GatewayEndpoint[];
};

export async function fetchGatewayServices(): Promise<GatewayService[]> {
  try {
    const res = await fetchRetry(`${GATEWAY}/api/services`, {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      return (await res.json()) as GatewayService[];
    }
  } catch {
    // catalog unreachable — callers render without the sells data
  }
  return [];
}

export function findServiceByWallet(
  services: GatewayService[],
  address: string
): GatewayService | undefined {
  const wallet = address.toLowerCase();
  return services.find((s) => s.payTo?.toLowerCase() === wallet);
}

export function priceFloor(service: GatewayService): string | null {
  const prices = service.endpoints
    .map((e) => Number.parseFloat(e.price))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  return prices.length > 0 ? `$${prices[0]}` : null;
}

export function serviceUrl(service: GatewayService): string {
  return `${GATEWAY}/services/${service.id}`;
}
