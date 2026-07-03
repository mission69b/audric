import { getCurrentUser } from "@audric/auth/server";
import { type NextRequest, NextResponse } from "next/server";

// Console → web-v3 proxy: prepare the on-chain SERVICE declaration for the
// signed-in Passport's SELF-agent (§II.15a stage 3 — owner==agent, so the
// Passport signs as the agent). Address pinned to the session user; the
// upstream merges unspecified fields and stages price/category as off-chain
// write-through meta.
const API = "https://api.t2000.ai/v1";

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: {
    mcpEndpoint?: string | null;
    paymentMethods?: string[];
    priceUsdc?: string;
    category?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const res = await fetch(`${API}/agent/service/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, address: session.user.id }),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
