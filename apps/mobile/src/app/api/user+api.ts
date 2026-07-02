import { productionGate } from "@/lib/api-guard";
import { upsertUser } from "@/lib/db/queries";

// Onboarding route — the native analogue of web-v3 creating the User row on first
// sign-in. Called once when a session becomes active (real OAuth OR the __DEV__
// bypass, see `useAuth`). Creates the identity row keyed by the Sui address so that
// `Chat.userId` FKs resolve when chat persistence writes. Idempotent (upsert), so a
// returning user just re-confirms an existing row.
//
// Runs SERVER-SIDE (Node) — the only place `POSTGRES_URL` is read; the client never
// touches the DB directly.
//
// ⚠️ DEV TRUST MODEL: this route trusts the { address, email } the client posts —
// there is NO auth yet (Phase 0). That is acceptable for dev because the address is
// the __DEV__ stub `0xde…`, not a real wallet. BEFORE this is exposed beyond local
// dev it MUST derive the identity from the verified `audric_session` cookie instead
// of the request body, exactly like web-v3 — never trust a client-supplied user id.

// A correctly-shaped Sui address: 0x + 64 hex. Matches both a derived address and
// the dev stub; rejects junk so we never write garbage identity rows.
const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export async function POST(request: Request) {
  const gated = productionGate();
  if (gated) return gated;

  let body: { address?: string; email?: string | null };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.toLowerCase() : "";
  if (!SUI_ADDRESS.test(address)) {
    return Response.json({ error: "Invalid address." }, { status: 400 });
  }

  const email =
    typeof body.email === "string" && body.email.length <= 100
      ? body.email
      : null;

  if (!process.env.POSTGRES_URL) {
    // No DB configured — treat onboarding as a soft success so the app still enters.
    return Response.json({ ok: true, persisted: false });
  }

  try {
    await upsertUser({ id: address, email });
    return Response.json({ ok: true, persisted: true });
  } catch (error) {
    console.error("[user route] upsert failed:", error);
    return Response.json({ error: "Could not create user." }, { status: 500 });
  }
}
