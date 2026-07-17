/**
 * Client-side pay-service executor — pays a cataloged external API per call.
 *
 * Runs in the browser on the zkLogin Passport session key — the same trust
 * model as sends (lib/wallet/send.ts): the server NEVER moves money; the
 * user's tap on the pay_service confirm card triggers this.
 *
 * Payment rail: the SDK's dual-dialect x402 loop (`payWithMpp`) — proxied
 * services settle through the gateway (no charge on failure); DIRECT sellers
 * settle straight to the seller's wallet (no automatic refund) and the SDK
 * auto-reports the digest to the gateway's activity ledger (S.743). Money
 * source: on-chain wallet USDC (never Audric credit — two-pots).
 *
 * Guards (fail-closed):
 * - Catalog allowlist by construction: the model supplies (serviceId, path);
 *   the URL is resolved HERE from the live mpp.t2000.ai catalog — no model-
 *   supplied URL is ever paid. Templated paths must match a listed template
 *   segment-for-segment.
 * - The charge bound is the CATALOG price (not the model's number) and the
 *   $5/call cap. If the catalog price drifted above what the model declared,
 *   the call refuses and the agent must re-offer.
 * - The user taps the confirm card (same human gate as send_transfer).
 */

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { payWithMpp } from "@t2000/sdk/browser";
import { env } from "@/lib/env";
import { isSessionExpired, loadSession, toZkLoginSigner } from "@/lib/zklogin";

const CATALOG_URL = "https://mpp.t2000.ai/api/services";
export const PAY_SERVICE_CAP_USD = 5;

/** Keep the model-visible response bounded — a 100KB hotel payload would
 *  blow the turn's context for no benefit. */
const RESPONSE_CHAR_BUDGET = 6000;

export type PayServiceOutcome = {
  paid: boolean;
  /** The API's delivered response (parsed JSON when possible, truncated). */
  response?: unknown;
  /** On-chain settlement digest — the receipt. */
  digest?: string;
  /** True when this endpoint is a direct seller (no auto-refund). */
  direct?: boolean;
  /** The resolved catalog price actually charged as maxPrice. */
  chargedUsdc?: number;
  error?: string;
};

type CatalogEndpoint = {
  method: string;
  path: string;
  price: string;
};

type CatalogService = {
  id: string;
  name: string;
  serviceUrl: string;
  direct?: boolean;
  endpoints: CatalogEndpoint[];
};

function grpcClient(): SuiGrpcClient {
  const network =
    env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network });
}

/** A concrete path matches a listed one exactly, or segment-for-segment
 *  against a `{param}` template (same segment count, statics equal). */
export function pathMatchesTemplate(concrete: string, listed: string): boolean {
  if (concrete === listed) {
    return true;
  }
  const c = concrete.split("/");
  const l = listed.split("/");
  if (c.length !== l.length) {
    return false;
  }
  return l.every(
    (seg, i) => (seg.startsWith("{") && seg.endsWith("}")) || seg === c[i]
  );
}

async function resolveEndpoint(
  serviceId: string,
  path: string
): Promise<{
  service: CatalogService;
  endpoint: CatalogEndpoint;
} | null> {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) {
    throw new Error("The service catalog is unreachable — try again shortly.");
  }
  const catalog = (await res.json()) as CatalogService[];
  const service = catalog.find((s) => s.id === serviceId);
  if (!service) {
    return null;
  }
  const endpoint = service.endpoints.find((e) =>
    pathMatchesTemplate(path, e.path)
  );
  return endpoint ? { service, endpoint } : null;
}

function truncateResponse(body: unknown): unknown {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  if (text == null || text.length <= RESPONSE_CHAR_BUDGET) {
    return body;
  }
  return `${text.slice(0, RESPONSE_CHAR_BUDGET)}… [truncated ${text.length - RESPONSE_CHAR_BUDGET} chars]`;
}

export async function payServiceCall(opts: {
  serviceId: string;
  path: string;
  method?: string;
  body?: string;
  /** The price the model declared (what the user agreed to). */
  priceUsdc: number;
}): Promise<PayServiceOutcome> {
  const session = loadSession();
  if (!session) {
    throw new Error("Not signed in — connect your Passport first.");
  }
  if (isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again.");
  }

  const resolved = await resolveEndpoint(opts.serviceId, opts.path);
  if (!resolved) {
    throw new Error(
      "That service/endpoint is not in the catalog — nothing was paid."
    );
  }
  const { service, endpoint } = resolved;

  const catalogPrice = Number.parseFloat(endpoint.price);
  if (!Number.isFinite(catalogPrice) || catalogPrice <= 0) {
    throw new Error("The catalog price is unreadable — nothing was paid.");
  }
  if (catalogPrice > PAY_SERVICE_CAP_USD) {
    throw new Error(
      `This endpoint costs $${catalogPrice}, above the in-chat cap ($${PAY_SERVICE_CAP_USD}).`
    );
  }
  // The user agreed to the model's stated price; if the live catalog price is
  // higher, refuse — the agent must re-offer at the real price.
  if (catalogPrice > opts.priceUsdc + 0.005) {
    throw new Error(
      `The live price is $${catalogPrice}, above the agreed $${opts.priceUsdc} — nothing was paid. Re-offer at the current price.`
    );
  }

  const method = (opts.method ?? endpoint.method ?? "POST").toUpperCase();
  const result = await payWithMpp({
    signer: toZkLoginSigner(session),
    client: grpcClient(),
    options: {
      // Allowlist by construction: origin + path both come from the catalog
      // entry resolved above, never from the model.
      url: `${service.serviceUrl}${opts.path}`,
      method,
      body: method === "GET" || method === "HEAD" ? undefined : opts.body,
      // The catalog price is the exact charge bound; approve nothing above it.
      maxPrice: catalogPrice,
    },
  });

  const ok = result.status >= 200 && result.status < 300;
  return {
    paid: result.paid,
    response: truncateResponse(result.body),
    digest: result.receipt?.reference,
    direct: service.direct === true,
    chargedUsdc: result.cost ?? catalogPrice,
    error: ok
      ? undefined
      : `The service answered HTTP ${result.status} — relay its error to the user honestly.`,
  };
}
