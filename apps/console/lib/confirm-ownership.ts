import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { fromBase64 } from "@mysten/sui/utils";

// Error responses arrive in two shapes: console-local routes use { error: "msg" }
// (string), while proxied web-v3 routes use openAiError's { error: { message } }
// (object). Normalize both so we never surface "[object Object]".
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
    error?: unknown;
  };
  if (!(prep.ok && pj.nonce && pj.txBytes)) {
    throw new Error(
      errMsg(
        pj.error,
        "Couldn't prepare the confirmation — it may already be confirmed. Refresh."
      )
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
    throw new Error(errMsg(sj.error, "Confirmation failed."));
  }
  return { digest: sj.digest };
}
