import { getCurrentUser } from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// Console → web-v3 proxy: submit the zkLogin-signed service-declaration bytes
// for the SELF-agent. Address pinned to the session user.
const API = "https://api.t2000.ai/v1";

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let nonce: string;
  let signature: string;
  try {
    const body = await request.json();
    nonce = String(body?.nonce ?? "").trim();
    signature = String(body?.signature ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!(nonce && signature)) {
    return NextResponse.json(
      { error: "nonce and signature are required." },
      { status: 400 }
    );
  }

  const res = await fetch(`${API}/agent/service/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce, address: session.user.id, signature }),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
