import { getCurrentUser } from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// Console → web-v3 proxy: submit the zkLogin-signed self-registration bytes.
// The address is pinned to the session user; the upstream verifies the
// signature against the stashed bytes and executes sponsored.
const API = "https://api.t2000.ai/v1";

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let regNonce: string;
  let signature: string;
  try {
    const body = await request.json();
    regNonce = String(body?.regNonce ?? "").trim();
    signature = String(body?.signature ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!(regNonce && signature)) {
    return NextResponse.json(
      { error: "regNonce and signature are required." },
      { status: 400 }
    );
  }

  const res = await fetch(`${API}/agent/register/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      regNonce,
      address: session.user.id,
      agentSignature: signature,
    }),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
