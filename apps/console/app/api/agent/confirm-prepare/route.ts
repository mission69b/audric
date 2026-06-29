import { getCurrentUser } from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// Console → web-v3 proxy for the human-Passport-owner ownership confirm (gate
// 8b). The OWNER is the session user (server-authoritative — never client-set);
// proxied server-side so there's no CORS + the browser only signs the bytes.
const API = "https://api.t2000.ai/v1";

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  let agent: string;
  try {
    agent = String((await request.json())?.agent ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!agent) {
    return NextResponse.json({ error: "agent is required." }, { status: 400 });
  }

  const res = await fetch(`${API}/agent/owner/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: session.user.id, agent }),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
