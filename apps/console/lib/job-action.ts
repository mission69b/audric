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

// Client half of the browser job verbs (t2 ACP Phase 2 — the seller inbox):
// the server stores the delivery content-addressed (deliver only) + builds
// the sponsored tx; the Passport session key signs the bytes; the server
// sponsor-co-signs and executes. Chain-side auth (escrow.move checks
// ctx.sender()) makes a mis-signed or mis-targeted verb impossible.
export async function runJobAction(opts: {
  action: "deliver" | "release" | "reject";
  jobId: string;
  deliveryText?: string;
}): Promise<{ digest?: string }> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again first.");
  }
  const signer = toZkLoginSigner(session);

  const prep = await fetch("/api/job/action-prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const pj = (await prep.json().catch(() => ({}))) as {
    nonce?: string;
    txBytes?: string;
    error?: unknown;
  };
  if (!prep.ok) {
    throw new Error(errMsg(pj.error, "Couldn't prepare the transaction."));
  }
  if (!(pj.nonce && pj.txBytes)) {
    throw new Error("Couldn't prepare the transaction — try again.");
  }

  const { signature } = await signer.signTransaction(fromBase64(pj.txBytes));

  const sub = await fetch("/api/job/action-submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: pj.nonce, signature }),
  });
  const sj = (await sub.json().catch(() => ({}))) as {
    digest?: string;
    error?: unknown;
  };
  if (!sub.ok) {
    throw new Error(errMsg(sj.error, "The transaction didn't go through."));
  }
  return { digest: sj.digest };
}
