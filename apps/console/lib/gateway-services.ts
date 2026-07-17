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
  /** Direct sellers: 402 dialect probed at ingest. Browser (Passport/zkLogin)
   *  payments only work on `x402` — the header dialect verifies a
   *  personal-message signature SELLER-side, which zkLogin sigs fail AFTER
   *  the money moved (JMPR incident, 2026-07-17). */
  dialect?: "x402" | "mpp-header";
  payTo?: string;
  endpoints: GatewayEndpoint[];
  /** Job-class (A2A escrow) listing — SPEC_A2A_ESCROW slice 2. Set when the
   *  seller's 402 advertises escrow terms: buyers fund an on-chain Job
   *  object (t2 job create) instead of paying per call, and the price is
   *  per JOB. Escrow listings always belong to a CLAIMED wallet (the
   *  gateway's claim gate requires a registered Agent ID). */
  escrow?: {
    deliverWithinMs: number;
    reviewWindowMs: number;
    rejectSplitBps: number;
  };
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

export type RailPayment = {
  id: number;
  /** Catalog service id — resolve to a store page via the services list. */
  service: string;
  endpoint: string;
  amount: string;
  digest: string | null;
  sender: string | null;
  createdAt: string;
};

/** The unified feed — every settlement the rail has logged (proxied rows at
 *  settle time, direct rows chain-verified via /api/mpp/report). */
export async function fetchRailPayments(
  limit = 60
): Promise<{ payments: RailPayment[]; total: number }> {
  try {
    const res = await fetchRetry(`${GATEWAY}/api/mpp/payments?limit=${limit}`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        payments?: RailPayment[];
        total?: number;
      };
      return { payments: data.payments ?? [], total: data.total ?? 0 };
    }
  } catch {
    // feed unreachable — callers render the empty state
  }
  return { payments: [], total: 0 };
}

export type RailVolumeDay = {
  date: string;
  label: string;
  count: number;
  volume: number;
};

export async function fetchRailVolume(): Promise<RailVolumeDay[]> {
  try {
    const res = await fetchRetry(`${GATEWAY}/api/mpp/volume`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = (await res.json()) as { days?: RailVolumeDay[] };
      return data.days ?? [];
    }
  } catch {
    // volume unreachable — callers render without the strip
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
