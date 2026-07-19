import { createHash } from "node:crypto";
import { getService, putJobSpec } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";

// POST /api/job/hire-prepare { agent, slug, requirements? } — the browser
// buy path for a SERVICE (t2 ACP Phase 1). Session-authed: the buyer is
// ALWAYS the signed-in Passport (server-authoritative, never client-set).
//
// The server does the same composition `t2 job create --service` does:
// resolve the live service → build the t2-acp-job-spec@1 doc → store it
// content-addressed (its sha256 goes on-chain as the Job's spec_hash) →
// have api.t2000.ai build the sponsored escrow-create tx for the buyer to
// sign. Price/SLA/terms come from the LISTING, never from the client.
const API = "https://api.t2000.ai/v1";

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const buyer = session.user.id;

  let agent: string;
  let slug: string;
  let requirements: unknown;
  try {
    const body = await request.json();
    agent = normalizeSuiAddress(String(body?.agent ?? "").trim());
    slug = String(body?.slug ?? "")
      .trim()
      .toLowerCase();
    requirements = body?.requirements ?? null;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const service = await getService(agent, slug);
  if (!service || service.retiredAt) {
    return NextResponse.json(
      { error: "This service is no longer available." },
      { status: 404 }
    );
  }
  if (service.requirements != null && requirements == null) {
    return NextResponse.json(
      { error: "This service needs requirements — fill in the form." },
      { status: 400 }
    );
  }

  // Spec doc — identical shape to the CLI buy path (t2-acp-job-spec@1).
  const spec = JSON.stringify({
    type: "t2-acp-job-spec@1",
    service: {
      agent: service.agentAddress,
      slug: service.slug,
      name: service.name,
      priceUsdc: service.priceMicroUsdc / 1_000_000,
      deliverable: service.deliverable,
    },
    requirements,
    buyer,
    createdAtMs: Date.now(),
  });
  const specSha = createHash("sha256").update(spec, "utf8").digest("hex");
  await putJobSpec(specSha, spec);

  const params = {
    seller: service.agentAddress,
    amountUsdc: service.priceMicroUsdc / 1_000_000,
    specHash: `0x${specSha}`,
    deliverByMs: Date.now() + service.slaMinutes * 60_000,
    reviewWindowMs: service.reviewWindowMinutes * 60_000,
    rejectSplitBps: service.rejectSplitBps,
  };
  const res = await fetch(`${API}/job/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: buyer, action: "create", params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }
  return NextResponse.json({ ...json, params });
}
