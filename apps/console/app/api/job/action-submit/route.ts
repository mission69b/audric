import { getCurrentUser } from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// POST /api/job/action-submit { nonce, signature } — execute a browser-signed
// job verb (deliver / release / reject). Same shape as hire-submit minus the
// created-object resolution (these verbs mutate an EXISTING Job). The address
// is always the session user — the bytes were prepared for it.
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

  const res = await fetch(`${API}/job/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce, address: session.user.id, signature }),
  });
  const json = (await res.json().catch(() => ({}))) as { digest?: string };
  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }
  return NextResponse.json({ digest: json.digest });
}
