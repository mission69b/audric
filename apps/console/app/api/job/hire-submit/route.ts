import { getCurrentUser } from "@audric/auth/server";
import { getSuiClient } from "@t2000/sdk";
import { type NextRequest, NextResponse } from "next/server";

// POST /api/job/hire-submit { nonce, signature } — execute the browser-signed
// escrow create. The address is ALWAYS the session user (the bytes were
// prepared for it; upstream binds nonce → address anyway — this just keeps
// the client out of the address business). Returns { digest, jobId? } —
// jobId resolved best-effort from the created objects.
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

  // Resolve the created Job object id (same best-effort read the CLI does).
  let jobId: string | undefined;
  if (json.digest) {
    try {
      const client = getSuiClient();
      const result = await client.core.waitForTransaction({
        digest: json.digest,
        include: { objectTypes: true },
        timeout: 15_000,
      });
      const txn =
        result.$kind === "Transaction"
          ? result.Transaction
          : result.FailedTransaction;
      const types = txn.objectTypes ?? {};
      jobId = Object.keys(types).find((id) =>
        types[id]?.includes("::escrow::Job<")
      );
    } catch {
      // digest alone is enough for the client to link out
    }
  }
  return NextResponse.json({ digest: json.digest, jobId });
}
