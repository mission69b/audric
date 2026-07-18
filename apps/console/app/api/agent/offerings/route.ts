import {
  getAgentProfile,
  listOfferings,
  parseOfferingUpsert,
  retireOffering,
  upsertOffering,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { MAX_JOB_USDC } from "@t2000/sdk";
import { type NextRequest, NextResponse } from "next/server";

// /api/agent/offerings — the console's owner-session offerings editor
// (t2 ACP Phase 1). Session-authed (the owner's Passport) + ownership-gated,
// exactly like /api/agent/profile: the agent's confirmed on-chain owner (or
// the self-agent itself) manages the catalog from the browser. Machines use
// the signed api.t2000.ai route instead; both paths share ONE validator
// (@audric/accounts parseOfferingUpsert) and ONE set of queries.
//
//   GET  ?agent=0x…                      → the agent's offerings (retired incl.)
//   POST { agent, action: "upsert", offering } | { agent, action: "retire", slug }

async function authorize(
  agentRaw: unknown
): Promise<{ agent: string } | NextResponse> {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  let agent: string;
  try {
    agent = normalizeSuiAddress(String(agentRaw ?? "").trim());
  } catch {
    return NextResponse.json({ error: "Invalid agent." }, { status: 400 });
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
  return { agent };
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request.nextUrl.searchParams.get("agent"));
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { offerings } = await listOfferings({
    agentAddress: auth.agent,
    includeRetired: true,
  });
  return NextResponse.json({ offerings });
}

export async function POST(request: NextRequest) {
  let body: {
    agent?: string;
    action?: string;
    offering?: unknown;
    slug?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const auth = await authorize(body.agent);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (body.action === "upsert") {
    const parsed = parseOfferingUpsert(body.offering, {
      maxPriceUsdc: MAX_JOB_USDC,
    });
    if (typeof parsed === "string") {
      return NextResponse.json({ error: parsed }, { status: 400 });
    }
    const row = await upsertOffering({
      agentAddress: auth.agent,
      slug: parsed.offering.slug,
      name: parsed.offering.name,
      description: parsed.offering.description,
      priceMicroUsdc: Math.round(parsed.offering.priceUsdc * 1_000_000),
      slaMinutes: parsed.offering.slaMinutes,
      reviewWindowMinutes: parsed.offering.reviewWindowMinutes,
      rejectSplitBps: parsed.offering.rejectSplitBps,
      requirements: parsed.offering.requirements,
      deliverable: parsed.offering.deliverable,
    });
    return NextResponse.json({ ok: true, offering: row });
  }

  if (body.action === "retire") {
    const slug = String(body.slug ?? "")
      .trim()
      .toLowerCase();
    const retired = await retireOffering(auth.agent, slug);
    if (!retired) {
      return NextResponse.json(
        { error: `No live offering "${slug}".` },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, retired: slug });
  }

  return NextResponse.json(
    { error: 'action must be "upsert" or "retire".' },
    { status: 400 }
  );
}
