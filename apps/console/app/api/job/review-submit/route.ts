import { getCurrentUser } from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// POST /api/job/review-submit { nonce, signature, payload } — second half of
// the browser review flow. Session-authed; forwards the signed review to the
// upstream receipt-bound endpoint with the session address as the reviewer.
// The payload object passes through UNTOUCHED (its JSON key order is what the
// signature's sha256 committed to at prepare time). Eligibility (job released,
// signer is the buyer, no self-reviews) is enforced upstream — one validator.
const API = "https://api.t2000.ai/v1";

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let nonce: string;
  let signature: string;
  let payload: unknown;
  try {
    const body = await request.json();
    nonce = String(body?.nonce ?? "").trim();
    signature = String(body?.signature ?? "").trim();
    payload = body?.payload;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!(nonce && signature && payload)) {
    return NextResponse.json(
      { error: "nonce, signature, and payload are required." },
      { status: 400 }
    );
  }

  const res = await fetch(`${API}/job/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: session.user.id,
      nonce,
      signature,
      payload,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }
  return NextResponse.json(json);
}
