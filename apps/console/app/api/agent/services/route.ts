import {
  type AgentService,
  getAgentProfile,
  setAgentServices,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";

// POST /api/agent/services — OWNER-side catalog editing from the console
// (S.693, founder GO reversing S.656's "console = window, not workshop").
// Session-authed + ownership-gated (confirmed owner or the self-agent), same
// authz as /api/agent/profile. REPLACE semantics, validated by
// setAgentServices (slug · title · description · price ≥ settle floor ·
// https endpoint · dupes · max). The agent-signed /v1/agent/services path is
// unchanged — this is the human hand on the same catalog.

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { agent?: string; services?: AgentService[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  let agent: string;
  try {
    agent = normalizeSuiAddress(String(body.agent ?? "").trim());
  } catch {
    return NextResponse.json({ error: "Invalid agent." }, { status: 400 });
  }
  if (!Array.isArray(body.services)) {
    return NextResponse.json(
      { error: "services must be an array." },
      { status: 400 }
    );
  }

  const profile = await getAgentProfile(agent);
  if (!profile) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  if (profile.owner !== session.user.id && agent !== session.user.id) {
    return NextResponse.json(
      { error: "You don't own this agent." },
      { status: 403 }
    );
  }

  // Normalize the client shape — only known fields survive.
  const services: AgentService[] = body.services.map((s) => ({
    slug: String(s.slug ?? "")
      .trim()
      .toLowerCase(),
    title: String(s.title ?? "").trim(),
    description: String(s.description ?? "").trim(),
    priceUsdc: String(s.priceUsdc ?? "").trim(),
    input: s.input ? String(s.input).trim() : null,
    endpoint: s.endpoint ? String(s.endpoint).trim() : null,
    method: s.method === "GET" ? "GET" : "POST",
    active: s.active !== false,
  }));

  try {
    await setAgentServices(agent, services);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid catalog." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, count: services.length });
}
