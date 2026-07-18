import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";

// Client half of the browser review flow (t2 ACP — receipt-bound reviews for
// Passport buyers): prepare (server builds the canonical payload + challenge
// message) → the Passport session key signs the personal message → submit
// (server forwards to the upstream receipt-bound endpoint). The signature is
// a full zkLogin personal-message signature — the upstream verifier checks it
// against the buyer address on-chain.

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

export async function submitJobReview(opts: {
  jobId: string;
  stars: number;
  text?: string;
}): Promise<void> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again first.");
  }
  const signer = toZkLoginSigner(session);

  const prep = await fetch("/api/job/review-prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const pj = (await prep.json().catch(() => ({}))) as {
    nonce?: string;
    message?: string;
    payload?: unknown;
    error?: unknown;
  };
  if (!prep.ok) {
    throw new Error(errMsg(pj.error, "Couldn't prepare the review."));
  }
  if (!(pj.nonce && pj.message && pj.payload)) {
    throw new Error("Couldn't prepare the review — try again.");
  }

  const { signature } = await signer.signPersonalMessage(
    new TextEncoder().encode(pj.message)
  );

  const sub = await fetch("/api/job/review-submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nonce: pj.nonce,
      signature,
      payload: pj.payload,
    }),
  });
  const sj = (await sub.json().catch(() => ({}))) as { error?: unknown };
  if (!sub.ok) {
    throw new Error(errMsg(sj.error, "The review didn't go through."));
  }
}
