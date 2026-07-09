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

// Client half of the owner-side UNLINK (registry v2 renounce_ownership,
// S.691): prepare (server pins owner = session + builds the sponsored
// renounce tx) → sign with the Passport session key → submit (the shared
// owner-submit proxy). On-chain the record returns to autonomous; re-linking
// is the normal propose + confirm flow.
export async function renounceOwnership(
  agent: string
): Promise<{ digest?: string }> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Sign in with your Passport first.");
  }
  const signer = toZkLoginSigner(session);

  const prep = await fetch("/api/agent/renounce-prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent }),
  });
  const pj = (await prep.json().catch(() => ({}))) as {
    nonce?: string;
    txBytes?: string;
    error?: unknown;
  };
  if (!(prep.ok && pj.nonce && pj.txBytes)) {
    throw new Error(
      errMsg(pj.error, "Couldn't prepare the unlink — are you the owner?")
    );
  }

  const { signature } = await signer.signTransaction(fromBase64(pj.txBytes));

  const sub = await fetch("/api/agent/confirm-submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: pj.nonce, signature }),
  });
  const sj = (await sub.json().catch(() => ({}))) as {
    digest?: string;
    error?: unknown;
  };
  if (!sub.ok) {
    throw new Error(errMsg(sj.error, "Unlink failed."));
  }
  return { digest: sj.digest };
}
