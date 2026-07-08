import { getCurrentUser } from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// Console → web-v3 proxy: prepare the on-chain `set_active` toggle for the
// signed-in Passport's SELF-agent (address pinned to the session user).
const API = "https://api.t2000.ai/v1";

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  let active: boolean;
  try {
    const body = await request.json();
    active = Boolean(body?.active);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const res = await fetch(`${API}/agent/active/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: session.user.id, active }),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
