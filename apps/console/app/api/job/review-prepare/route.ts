import { createHash } from "node:crypto";
import { getCurrentUser } from "@audric/auth/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";

// POST /api/job/review-prepare { jobId, stars, text? } — first half of the
// browser review flow (t2 ACP: receipt-bound reviews for Passport buyers).
// Session-authed. Builds the CANONICAL payload + fetches a challenge nonce
// for the signed-in address, and returns the exact personal-message string
// the Passport must sign: `t2000-job-review:{nonce}:{sha256(payload JSON)}`.
// The payload object round-trips untouched to /api/job/review-submit so the
// upstream hash recomputation matches byte-for-byte.
const API = "https://api.t2000.ai/v1";

const MAX_TEXT_CHARS = 400;

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const buyer = session.user.id;

  let jobId: string;
  let stars: number;
  let text: string | null;
  try {
    const body = await request.json();
    jobId = normalizeSuiAddress(String(body?.jobId ?? "").trim());
    stars = Number(body?.stars);
    const rawText = String(body?.text ?? "").trim();
    text = rawText.length > 0 ? rawText : null;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!isValidSuiAddress(jobId)) {
    return NextResponse.json(
      { error: "A valid jobId (0x…) is required." },
      { status: 400 }
    );
  }
  if (!(Number.isInteger(stars) && stars >= 1 && stars <= 5)) {
    return NextResponse.json(
      { error: "Pick a star rating (1–5)." },
      { status: 400 }
    );
  }
  if (text && text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `Keep the review under ${MAX_TEXT_CHARS} characters.` },
      { status: 400 }
    );
  }

  const chRes = await fetch(`${API}/agent/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: buyer }),
  });
  const challenge = (await chRes.json().catch(() => ({}))) as {
    nonce?: string;
  };
  if (!(chRes.ok && challenge.nonce)) {
    return NextResponse.json(
      { error: "Couldn't get a signing challenge — try again." },
      { status: 502 }
    );
  }

  // Key order is load-bearing: the upstream verifier hashes
  // JSON.stringify(payload) of the object as it arrives.
  const payload = { jobId, stars, text };
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");

  return NextResponse.json({
    nonce: challenge.nonce,
    message: `t2000-job-review:${challenge.nonce}:${payloadHash}`,
    payload,
  });
}
