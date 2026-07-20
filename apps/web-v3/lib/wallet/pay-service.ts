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
import { normalizeSuiAddress } from "@mysten/sui/utils";
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

/** The slice of JSON Schema the confirm-card form + preflight understand. */
export type EndpointSchemaInfo = {
  required?: string[];
  properties?: Record<
    string,
    { type?: string; description?: string; enum?: string[] }
  >;
};

type CatalogEndpoint = {
  method: string;
  path: string;
  price: string;
  /** Seller's request schema (JSON Schema) — used to fail closed on a missing body. */
  schema?: EndpointSchemaInfo;
  /**
   * Seller's declared 200-response schema (JSON Schema) — the deliverable's
   * TYPE contract (@t2000/serve `.response()`, carried through catalog
   * ingest). contentMediaType / format annotations tell the receipt card
   * what it's rendering, so deliverables display by declaration, not
   * sniffing.
   */
  responseSchema?: Record<string, unknown>;
};

type CatalogService = {
  id: string;
  name: string;
  serviceUrl: string;
  direct?: boolean;
  /** Direct sellers: 402 dialect probed at gateway ingest. */
  dialect?: "x402" | "mpp-header";
  /** Direct sellers: the wallet their 402 pays (pinned at ingest). */
  payTo?: string;
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

/**
 * Schema for the confirm-card's input form (null = no body schema / not
 * found / catalog unreachable — the card falls back to the model-built
 * body). Same catalog resolution the executor uses, so what the form shows
 * is what the preflight enforces.
 */
export async function fetchEndpointSchema(
  serviceId: string,
  path: string,
  method?: string
): Promise<EndpointSchemaInfo | null> {
  try {
    const resolved = await resolveEndpoint(serviceId, path);
    if (!resolved) {
      return null;
    }
    const m = (method ?? resolved.endpoint.method ?? "POST").toUpperCase();
    if (m === "GET" || m === "HEAD") {
      return null;
    }
    const schema = resolved.endpoint.schema;
    return schema?.properties && Object.keys(schema.properties).length > 0
      ? schema
      : null;
  } catch {
    return null;
  }
}

/**
 * The endpoint's declared 200-response schema (null = seller doesn't declare
 * one / catalog unreachable). The receipt card renders deliverables from
 * these annotations; sellers without one fall back to content sniffing.
 */
export async function fetchResponseSchema(
  serviceId: string,
  path: string
): Promise<Record<string, unknown> | null> {
  try {
    const resolved = await resolveEndpoint(serviceId, path);
    return resolved?.endpoint.responseSchema ?? null;
  } catch {
    return null;
  }
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

  // Passport is a zkLogin wallet — it can only safely pay x402 sellers (the
  // chain verifies the payer's signature). Header-dialect sellers verify a
  // personal-message signature THEMSELVES; zkLogin sigs fail that check
  // AFTER the payment settled (JMPR, 2026-07-17: charged, no delivery).
  // These sellers are filtered out of the model's catalog too — this is the
  // fail-closed backstop, and the SDK enforces the same rule at pay time.
  // INTENTIONAL KEEP: the gateway's hard x402 listing gate (S.749) means this
  // normally never fires — kept as defense-in-depth, do not sweep.
  if (service.direct === true && service.dialect !== "x402") {
    throw new Error(
      `${service.name} only accepts a payment dialect that browser Passport wallets can't safely pay — nothing was paid. It can be used from the t2 CLI or an MCP agent wallet instead.`
    );
  }

  // Self-payment guard: paying a seller whose payTo IS this wallet moves
  // money to itself — the tx executes but nets a zero balance change, so the
  // seller's settle check refuses to serve AFTER the on-chain leg ran
  // (founder × Funkii Studio, 2026-07-20). Fail before anything is signed.
  if (
    service.payTo &&
    normalizeSuiAddress(service.payTo) === normalizeSuiAddress(session.address)
  ) {
    throw new Error(
      `${service.name} is sold by THIS wallet — you can't buy from yourself (the payment would net zero and the seller won't serve it). Nothing was paid. Test it from a different wallet, e.g. the t2 CLI.`
    );
  }

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

  // Fail closed BEFORE the payment handshake when the model skipped required
  // body fields (Kimi omitted the body entirely, 2026-07-20: the seller 422s
  // and the turn burns a confirm tap for nothing). Serve-side validation
  // never charges on a 422, but the honest move is to not even dial.
  const required = endpoint.schema?.required ?? [];
  if (required.length > 0 && method !== "GET" && method !== "HEAD") {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = opts.body ? JSON.parse(opts.body) : null;
    } catch {
      throw new Error(
        "The request body is not valid JSON — nothing was paid. Rebuild it from the endpoint's requestSchema."
      );
    }
    const missing = required.filter(
      (k) => parsed?.[k] == null || parsed[k] === ""
    );
    if (missing.length > 0) {
      throw new Error(
        `The request body is missing required field(s): ${missing.join(", ")} — nothing was paid. Build the body from the endpoint's requestSchema and ask the user for anything you don't know.`
      );
    }
  }
  // Direct sellers rarely serve CORS headers (JMPR: none), so browser calls
  // go through the gateway's catalog-pinned relay — the 402 handshake passes
  // through untouched and payment still settles client → seller. The relay
  // logs the settlement to the activity ledger server-side (the SDK's own
  // report skips gateway-origin URLs).
  const callBase = service.direct
    ? `https://mpp.t2000.ai/api/relay/${service.id}`
    : service.serviceUrl;
  const result = await payWithMpp({
    signer: toZkLoginSigner(session),
    client: grpcClient(),
    options: {
      // Allowlist by construction: origin + path both come from the catalog
      // entry resolved above, never from the model.
      url: `${callBase}${opts.path}`,
      method,
      body: method === "GET" || method === "HEAD" ? undefined : opts.body,
      // The catalog price is the exact charge bound; approve nothing above it.
      maxPrice: catalogPrice,
    },
  });

  const ok = result.status >= 200 && result.status < 300;
  // Charge honesty: `paid` is receipt-derived. A seller-side reject with no
  // settlement (e.g. a 422 from body validation) means NOTHING was charged —
  // the model must never tell the user they were (founder hit exactly that
  // misreport, 2026-07-20).
  return {
    paid: result.paid,
    response: truncateResponse(result.body),
    digest: result.receipt?.reference,
    direct: service.direct === true,
    chargedUsdc: result.paid ? (result.cost ?? catalogPrice) : 0,
    error: ok
      ? undefined
      : `The service answered HTTP ${result.status}${
          result.paid
            ? " AFTER payment settled — relay its error honestly and note the charge"
            : " and NO payment was made (chargedUsdc is 0) — tell the user they were NOT charged, then fix the request and re-offer"
        }.`,
  };
}
