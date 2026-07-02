import { getAgentProfile } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { AGENT_ID_REGISTRY_ID } from "@t2000/id";

// The gateway owns the commerce settlement receipts; reputation is aggregated
// from them ("Verified on the rail", C.3).
const GATEWAY_BASE = "https://mpp.t2000.ai";

type Reputation = {
  sales: number;
  volumeUsd: number;
  buyers: number;
  lastSaleAt: string | null;
};

async function fetchReputation(
  address: string
): Promise<Reputation | undefined> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/commerce/stats/${address}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return;
    }
    const d = (await res.json()) as Reputation & { seller?: string };
    // Only surface reputation once there's at least one real sale. Strip the
    // gateway's internal `seller` echo — it's redundant in the public profile.
    return d.sales > 0
      ? {
          sales: d.sales,
          volumeUsd: d.volumeUsd,
          buyers: d.buyers,
          lastSaleAt: d.lastSaleAt,
        }
      : undefined;
  } catch {
    return;
  }
}

// GET /v1/agents/:address → the agent's profile as ERC-8004 `registration-v1`
// JSON (Agent ID B.1 gate 6 — the default profile / metadataUri target),
// enriched with rail reputation (C.3). Public.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address: raw } = await params;
  const address = normalizeSuiAddress(String(raw ?? "").trim());
  if (!isValidSuiAddress(address)) {
    return Response.json({ error: "Invalid Sui address." }, { status: 400 });
  }

  const profile = await getAgentProfile(address);
  if (!profile) {
    return Response.json(
      { error: "Agent not found in the directory." },
      { status: 404 }
    );
  }

  const reputation = await fetchReputation(address);

  return Response.json({
    name: profile.displayName ?? profile.name,
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    active: profile.active,
    image: profile.imageUrl ?? undefined,
    description: profile.description ?? "A t2000 Agent ID.",
    address: profile.address,
    // Self-sovereign: the agent registers itself, so the creator IS the agent
    // address (sender == agent in registry::register). The human `owner` below
    // is the separately-linked Passport (optional) — richer than chains that
    // collapse owner=creator=wallet into one.
    creator: profile.address,
    chain: "sui:mainnet",
    registry: AGENT_ID_REGISTRY_ID,
    registerDigest: profile.registerDigest ?? undefined,
    owner: profile.owner ?? undefined,
    metadataUri: profile.metadataUri ?? undefined,
    mcpEndpoint: profile.mcpEndpoint ?? undefined,
    paymentMethods: profile.paymentMethods ?? undefined,
    priceUsdc: profile.priceUsdc ?? undefined,
    category: profile.category ?? undefined,
    // Off-chain social links — omitted entirely when none are set.
    links:
      profile.website || profile.twitter || profile.github
        ? {
            website: profile.website ?? undefined,
            twitter: profile.twitter ?? undefined,
            github: profile.github ?? undefined,
          }
        : undefined,
    reputation,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    registrations: [
      {
        agentId: profile.numericId ?? undefined,
        agentRegistry: `sui:mainnet:${AGENT_ID_REGISTRY_ID}`,
      },
    ],
  });
}
