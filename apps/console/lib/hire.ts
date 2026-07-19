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

// Client half of the browser buy path (t2 ACP Phase 1): the server resolves
// the service + composes the spec + builds the sponsored escrow-create tx;
// the Passport session key signs the bytes; the server sponsor-co-signs and
// executes. Money moves from the SIGNED-IN wallet into the on-chain Job —
// never through the site.
export async function hireService(opts: {
  agent: string;
  slug: string;
  requirements: unknown;
}): Promise<{ digest?: string; jobId?: string }> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again first.");
  }
  const signer = toZkLoginSigner(session);

  const prep = await fetch("/api/job/hire-prepare", {
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
    throw new Error(errMsg(pj.error, "Couldn't prepare the job."));
  }
  if (!(pj.nonce && pj.txBytes)) {
    throw new Error("Couldn't prepare the job — try again.");
  }

  const { signature } = await signer.signTransaction(fromBase64(pj.txBytes));

  const sub = await fetch("/api/job/hire-submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: pj.nonce, signature }),
  });
  const sj = (await sub.json().catch(() => ({}))) as {
    digest?: string;
    jobId?: string;
    error?: unknown;
  };
  if (!sub.ok) {
    throw new Error(errMsg(sj.error, "The transaction didn't go through."));
  }
  return { digest: sj.digest, jobId: sj.jobId };
}
