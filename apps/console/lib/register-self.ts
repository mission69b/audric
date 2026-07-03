import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { fromBase64 } from "@mysten/sui/utils";

function errMsg(error: unknown, fallback: string): string {
  if (typeof error === "string") {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

// Client half of consent-first self-registration (§II.15a stage 2): prepare
// (server pins the address to the session user + builds the sponsored register
// tx) → sign the bytes with the Passport session key → submit. Idempotent —
// an already-registered address short-circuits without signing.
export async function registerSelf(): Promise<{
  digest?: string;
  alreadyRegistered?: boolean;
}> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again first.");
  }
  const signer = toZkLoginSigner(session);

  const prep = await fetch("/api/agent/register-prepare", { method: "POST" });
  const pj = (await prep.json().catch(() => ({}))) as {
    alreadyRegistered?: boolean;
    regNonce?: string;
    txBytes?: string;
    error?: unknown;
  };
  if (!prep.ok) {
    throw new Error(errMsg(pj.error, "Couldn't prepare the registration."));
  }
  if (pj.alreadyRegistered) {
    return { alreadyRegistered: true };
  }
  if (!(pj.regNonce && pj.txBytes)) {
    throw new Error("Couldn't prepare the registration — try again.");
  }

  const { signature } = await signer.signTransaction(fromBase64(pj.txBytes));

  const sub = await fetch("/api/agent/register-submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regNonce: pj.regNonce, signature }),
  });
  const sj = (await sub.json().catch(() => ({}))) as {
    digest?: string;
    error?: unknown;
  };
  if (!sub.ok) {
    throw new Error(errMsg(sj.error, "Registration failed — try again."));
  }
  return { digest: sj.digest };
}
