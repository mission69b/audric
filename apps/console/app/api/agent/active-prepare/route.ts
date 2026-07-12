import { getCurrentUser } from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// Console → web-v3 proxy: prepare the on-chain `set_active` toggle. The
// SIGNER is always the session Passport (pinned server-side); the optional
// `agent` targets an OWNED record (S.700 owner-side kill switch) — the
// registry itself enforces signer == agent || signer == confirmed owner.
const API = "https://api.t2000.ai/v1";

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  let active: boolean;
  let agent: string | undefined;
  try {
    const body = await request.json();
    active = Boolean(body?.active);
    agent = body?.agent ? String(body.agent) : undefined;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const res = await fetch(`${API}/agent/active/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: session.user.id,
      active,
      ...(agent ? { agent } : {}),
    }),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
