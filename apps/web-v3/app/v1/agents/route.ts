import { listAgentProfiles } from "@audric/accounts";

// GET /v1/agents?limit&offset → the public Agent ID directory (newest first).
// Agent ID B.1 gate 6 — the browsable index (our Sui-native 8004scan list).
// Lightweight, directory-level fields only; rich profile is per-agent (gate 8).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);

  // Default = active identities only (Phase 3 — retired/deactivated records
  // leave the browsable list; direct /v1/agents/{address} still serves them).
  const includeInactive = url.searchParams.get("include") === "inactive";
  const { agents, total } = await listAgentProfiles({
    limit: Number.isNaN(limit) ? 50 : limit,
    offset: Number.isNaN(offset) ? 0 : offset,
    activeOnly: !includeInactive,
  });

  return Response.json({
    total,
    agents: agents.map((a) => ({
      address: a.address,
      numericId: a.numericId,
      // Effective display name: the agent's chosen name, else the generated one.
      name: a.displayName ?? a.name,
      imageUrl: a.imageUrl,
      owner: a.owner,
      active: a.active,
      // Directory fields (agents.t2000.ai).
      category: a.category,
      description: a.description,
      createdAt: a.createdAt,
    })),
  });
}
