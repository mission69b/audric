import { getCurrentUser } from "@audric/auth/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";

// POST /api/job/action-prepare { action, jobId, deliveryText? } — the browser
// half of the job lifecycle for Passport wallets (t2 ACP Phase 2: the seller
// inbox). Session-authed: the actor is ALWAYS the signed-in Passport; the
// chain authorizes the rest (escrow.move gates deliver on ctx.sender() ==
// seller, reject on buyer — the upstream prepare simulates and surfaces Move
// aborts as 400s, so a wrong actor can't even get bytes to sign).
//
//   deliver — deliveryText is stored content-addressed in the same store the
//     job spec lives in (sha256 → /v1/job/spec/{hash}); the hash goes on-chain
//     as the delivery commitment. The buyer reads the content back by hash and
//     can verify it against the Job object. (CLI sellers hash files locally;
//     the browser path uploads so delivery transport is in-band.)
//   release | reject — buyer verbs, params are just the job id.
const API = "https://api.t2000.ai/v1";

const ACTIONS = new Set(["deliver", "release", "reject"]);
const MAX_DELIVERY_BYTES = 16 * 1024;

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const actor = session.user.id;

  let action: string;
  let jobId: string;
  let deliveryText: string;
  try {
    const body = await request.json();
    action = String(body?.action ?? "").trim();
    jobId = normalizeSuiAddress(String(body?.jobId ?? "").trim());
    deliveryText = String(body?.deliveryText ?? "");
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "action must be deliver, release, or reject." },
      { status: 400 }
    );
  }
  if (!isValidSuiAddress(jobId)) {
    return NextResponse.json(
      { error: "A valid jobId (0x…) is required." },
      { status: 400 }
    );
  }

  const params: Record<string, unknown> = { jobId };
  if (action === "deliver") {
    const text = deliveryText.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Write the delivery first — the buyer receives this text." },
        { status: 400 }
      );
    }
    if (new TextEncoder().encode(text).length > MAX_DELIVERY_BYTES) {
      return NextResponse.json(
        { error: `Delivery too large (max ${MAX_DELIVERY_BYTES} bytes).` },
        { status: 400 }
      );
    }
    const specRes = await fetch(`${API}/job/spec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    const specJson = (await specRes.json().catch(() => ({}))) as {
      hash?: string;
    };
    if (!(specRes.ok && specJson.hash)) {
      return NextResponse.json(
        { error: "Couldn't store the delivery — try again." },
        { status: 502 }
      );
    }
    params.deliveryHash = `0x${specJson.hash}`;
  }

  const res = await fetch(`${API}/job/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: actor, action, params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }
  return NextResponse.json(json);
}
