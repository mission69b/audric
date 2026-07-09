import { getCurrentUser } from "@audric/auth/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";

// Console → web-v3 relay for the CREATE-AGENT composition flow (T1/A2,
// SPEC_COMPOSITION_MOMENT §3). Unlike the self-register proxy, the agent
// address here is a FRESH browser-minted keypair — so this relay does NOT pin
// `address` to the session. Security posture is unchanged from the public
// api.t2000.ai routes (the agent's signature is the auth); the session gate +
// step allowlist just keep this surface scoped to signed-in console users,
// and `propose-prepare` pins the proposed OWNER to the session Passport.
const API = "https://api.t2000.ai/v1";

const STEPS = {
  "register-prepare": "/agent/register/prepare",
  "register-submit": "/agent/register/submit",
  "propose-prepare": "/agent/owner/propose",
  "owner-submit": "/agent/owner/submit",
} as const;

type Step = keyof typeof STEPS;

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const step = String(body.step ?? "") as Step;
  if (!(step in STEPS)) {
    return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  }

  let address: string;
  try {
    address = normalizeSuiAddress(String(body.address ?? "").trim());
  } catch {
    return NextResponse.json({ error: "Invalid address." }, { status: 400 });
  }
  if (!isValidSuiAddress(address)) {
    return NextResponse.json({ error: "Invalid address." }, { status: 400 });
  }

  let upstreamBody: Record<string, unknown>;
  switch (step) {
    case "register-prepare":
      upstreamBody = { address };
      break;
    case "register-submit":
      upstreamBody = {
        regNonce: String(body.regNonce ?? ""),
        address,
        agentSignature: String(body.agentSignature ?? ""),
      };
      break;
    case "propose-prepare":
      // The proposed owner is ALWAYS the signed-in Passport.
      upstreamBody = { address, owner: session.user.id };
      break;
    case "owner-submit":
      upstreamBody = {
        nonce: String(body.nonce ?? ""),
        address,
        signature: String(body.signature ?? ""),
      };
      break;
    default:
      return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  }

  const res = await fetch(`${API}${STEPS[step]}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(upstreamBody),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
