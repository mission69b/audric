import { agentProfile, db, listOfferings } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { inArray } from "drizzle-orm";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// GET /v1/offerings — the public offerings board (t2 ACP Phase 1).
// ?agent=<address>  filter to one seller (includes its retired rows — the
//                   seller-management view; `t2 offering list`)
// ?q=<text>         naive text search across name/description/deliverable
//                   (`t2 browse`)
// ?limit / ?offset  pagination (max 100)
// Public, IP-rate-limited, no auth — it's a storefront.

export async function GET(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }
  const url = new URL(request.url);
  const agentRaw = url.searchParams.get("agent")?.trim();
  const q = url.searchParams.get("q")?.trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  let agentAddress: string | undefined;
  if (agentRaw) {
    agentAddress = normalizeSuiAddress(agentRaw);
    if (!isValidSuiAddress(agentAddress)) {
      return openAiError(
        400,
        "agent must be a valid Sui address.",
        "invalid_request_error",
        "invalid_address"
      );
    }
  }

  const { offerings, total } = await listOfferings({
    agentAddress,
    search: q,
    // The per-agent view is the seller's management surface — show retired.
    includeRetired: Boolean(agentAddress),
    // Board/search views hide sellers whose Agent ID is deactivated or
    // delisted; the seller can still manage their own rows.
    visibleSellersOnly: !agentAddress,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  });

  // Attach seller display fields for the page of results (≤100 rows).
  const addresses = [...new Set(offerings.map((o) => o.agentAddress))];
  const profiles =
    addresses.length > 0
      ? await db
          .select({
            address: agentProfile.address,
            name: agentProfile.name,
            displayName: agentProfile.displayName,
            numericId: agentProfile.numericId,
          })
          .from(agentProfile)
          .where(inArray(agentProfile.address, addresses))
      : [];
  const byAddress = new Map(profiles.map((p) => [p.address, p]));

  return Response.json({
    total,
    offerings: offerings.map((o) => {
      const seller = byAddress.get(o.agentAddress);
      return {
        agent: o.agentAddress,
        agentName: seller?.displayName ?? seller?.name ?? null,
        agentNumericId: seller?.numericId ?? null,
        slug: o.slug,
        name: o.name,
        description: o.description,
        priceUsdc: o.priceMicroUsdc / 1_000_000,
        slaMinutes: o.slaMinutes,
        reviewWindowMinutes: o.reviewWindowMinutes,
        rejectSplitBps: o.rejectSplitBps,
        requirements: o.requirements ?? null,
        deliverable: o.deliverable,
        retired: o.retiredAt != null,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      };
    }),
  });
}
