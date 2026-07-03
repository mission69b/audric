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

// Client half of the SELF-agent service declaration (§II.15a stage 3): the
// Passport IS the agent, so it signs the on-chain `service` update directly —
// prepare (address pinned server-side) → sign → submit. Sponsored, gasless.
export async function updateSelfService(fields: {
  mcpEndpoint?: string | null;
  paymentMethods?: string[];
  priceUsdc?: string;
  category?: string;
}): Promise<{ digest?: string }> {
  const session = loadSession();
  if (!session || isSessionExpired(session)) {
    throw new Error("Your session expired — sign in again first.");
  }
  const signer = toZkLoginSigner(session);

  const prep = await fetch("/api/agent/service-prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const pj = (await prep.json().catch(() => ({}))) as {
    nonce?: string;
    txBytes?: string;
    error?: unknown;
  };
  if (!(prep.ok && pj.nonce && pj.txBytes)) {
    throw new Error(errMsg(pj.error, "Couldn't prepare the service update."));
  }

  const { signature } = await signer.signTransaction(fromBase64(pj.txBytes));

  const sub = await fetch("/api/agent/service-submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: pj.nonce, signature }),
  });
  const sj = (await sub.json().catch(() => ({}))) as {
    digest?: string;
    error?: unknown;
  };
  if (!sub.ok) {
    throw new Error(errMsg(sj.error, "Service update failed."));
  }
  return { digest: sj.digest };
}
