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
    const d = (await res.json()) as Reputation;
    // Only surface reputation once there's at least one real sale.
    return d.sales > 0 ? d : undefined;
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
    owner: profile.owner ?? undefined,
    metadataUri: profile.metadataUri ?? undefined,
    mcpEndpoint: profile.mcpEndpoint ?? undefined,
    paymentMethods: profile.paymentMethods ?? undefined,
    priceUsdc: profile.priceUsdc ?? undefined,
    reputation,
    createdAt: profile.createdAt,
    registrations: [
      {
        agentId: profile.numericId ?? undefined,
        agentRegistry: `sui:mainnet:${AGENT_ID_REGISTRY_ID}`,
      },
    ],
  });
}
