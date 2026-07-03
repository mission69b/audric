import { getCurrentUser } from "@audric/auth/server";
import { NextResponse } from "next/server";

// Console → web-v3 proxy: prepare the SELF-registration of the signed-in
// Passport as an Agent ID (§II.15a stage 2 — consent-first auto-register).
// The address is ALWAYS the session user (server-authoritative, never
// client-set); the browser only signs the returned bytes. Sponsored + idempotent
// upstream (already-registered → { alreadyRegistered: true }).
const API = "https://api.t2000.ai/v1";

export async function POST() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const res = await fetch(`${API}/agent/register/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: session.user.id }),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
