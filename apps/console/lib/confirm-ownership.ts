import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { fromBase64 } from "@mysten/sui/utils";

// Client half of the human-owner ownership confirm (gate 8b): prepare (server
// builds the sponsored confirm tx) → sign the bytes with the Passport session
// key → submit. The owner is the session user (enforced server-side).
export async function confirmOwnership(
  agent: string
): Promise<{ digest?: string }> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Sign in with your Passport first.");
  }
  const signer = toZkLoginSigner(session);

  const prep = await fetch("/api/agent/confirm-prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent }),
  });
  const pj = (await prep.json().catch(() => ({}))) as {
    nonce?: string;
    txBytes?: string;
    error?: string;
  };
  if (!(prep.ok && pj.nonce && pj.txBytes)) {
    throw new Error(pj.error ?? "Couldn't prepare the confirmation.");
  }

  const { signature } = await signer.signTransaction(fromBase64(pj.txBytes));

  const sub = await fetch("/api/agent/confirm-submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: pj.nonce, signature }),
  });
  const sj = (await sub.json().catch(() => ({}))) as {
    digest?: string;
    error?: string;
  };
  if (!sub.ok) {
    throw new Error(sj.error ?? "Confirmation failed.");
  }
  return { digest: sj.digest };
}
