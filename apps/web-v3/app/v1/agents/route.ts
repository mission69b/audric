import { listAgentProfiles } from "@audric/accounts";

// GET /v1/agents?limit&offset → the public Agent ID directory (newest first).
// Agent ID B.1 gate 6 — the browsable index (our Sui-native 8004scan list).
// Lightweight, directory-level fields only; rich profile is per-agent (gate 8).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);

  const { agents, total } = await listAgentProfiles({
    limit: Number.isNaN(limit) ? 50 : limit,
    offset: Number.isNaN(offset) ? 0 : offset,
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
      // Directory columns (8004scan-style): service type + x402 support.
      service: a.mcpEndpoint ? "MCP" : null,
      x402: Array.isArray(a.paymentMethods)
        ? a.paymentMethods.includes("x402")
        : false,
      priceUsdc: a.priceUsdc,
      // Storefront fields (agents.t2000.ai services grid).
      category: a.category,
      description: a.description,
      createdAt: a.createdAt,
      // Store v2 Phase 1/2: catalog agents (services[]) — count + min price
      // let the grid render "N services · from $X" without N+1 doc fetches.
      servicesCount:
        a.services?.filter((s) => s.active !== false).length ?? 0,
      servicesFromUsdc: a.services?.length
        ? a.services
            .filter((s) => s.active !== false)
            .reduce<string | null>(
              (min, s) =>
                min === null || Number(s.priceUsdc) < Number(min)
                  ? s.priceUsdc
                  : min,
              null
            )
        : null,
    })),
  });
}
