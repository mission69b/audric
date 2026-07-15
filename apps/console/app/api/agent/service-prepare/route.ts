import { getCurrentUser } from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// Console → web-v3 proxy: prepare the registry `update` that sets the
// SELF-agent's x402 service endpoint (the seller flow). The signer is always
// the session Passport — registry `update` is signer == agent, so only the
// self-agent's listing is editable here. The endpoint is live-probed
// server-side (402 + valid Sui challenge) before any tx is built.
const API = "https://api.t2000.ai/v1";

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  let endpoint: string;
  try {
    const body = await request.json();
    endpoint = String(body?.endpoint ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const res = await fetch(`${API}/agent/service/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: session.user.id, endpoint }),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
