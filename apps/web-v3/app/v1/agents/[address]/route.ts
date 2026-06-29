import { getAgentProfile } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { AGENT_ID_REGISTRY_ID } from "@t2000/id";

// GET /v1/agents/:address → the agent's profile as ERC-8004 `registration-v1`
// JSON (Agent ID B.1 gate 6 — the default profile / metadataUri target). The
// rich/owned profile (services, image) lands with gate 8 (Walrus). Public.
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

  return Response.json({
    name: profile.displayName ?? profile.name,
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    active: profile.active,
    image: profile.imageUrl ?? undefined,
    description: profile.description ?? "A t2000 Agent ID.",
    address: profile.address,
    owner: profile.owner ?? undefined,
    metadataUri: profile.metadataUri ?? undefined,
    createdAt: profile.createdAt,
    registrations: [
      {
        agentId: profile.numericId ?? undefined,
        agentRegistry: `sui:mainnet:${AGENT_ID_REGISTRY_ID}`,
      },
    ],
  });
}
