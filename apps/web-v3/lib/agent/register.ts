import "server-only";

import { buildRegisterTx } from "@t2000/id";
import { prepareSponsoredTx, submitSponsoredTx } from "@/lib/agent/sponsored";

// Sponsored on-chain registration — Agent ID B.1 gate 5b. A thin wrapper over
// the shared sponsored-tx machinery (lib/agent/sponsored.ts): build the register
// tx + classify the register-specific abort (EAlreadyRegistered → idempotent
// `alreadyRegistered`). The registry requires `sender == agent`; 0-SUI agents
// register via the sponsor (0x6988) paying gas.

export { isSponsorConfigured } from "@/lib/agent/sponsored";

/** The gRPC `build()` resolves via simulation, so a re-register surfaces the
 *  `EAlreadyRegistered` (abort code 0) abort at prepare-time. */
function isAlreadyRegisteredError(message: string): boolean {
  return /abort code: 0\b/.test(message) && /registry::register/.test(message);
}

export type PrepareResult =
  | { ok: true; alreadyRegistered: false; regNonce: string; txBytes: string }
  | { ok: true; alreadyRegistered: true }
  | { ok: false; reason: "unconfigured" | "build_failed" };

export async function prepareSponsoredRegister(opts: {
  address: string;
  mcpEndpoint?: string | null;
  paymentMethods?: string[];
  did?: string | null;
}): Promise<PrepareResult> {
  const tx = buildRegisterTx({
    mcpEndpoint: opts.mcpEndpoint ?? null,
    paymentMethods: opts.paymentMethods ?? [],
    did: opts.did ?? null,
    metadataUri: null,
  });
  const res = await prepareSponsoredTx(opts.address, tx);
  if (res.ok) {
    return {
      ok: true,
      alreadyRegistered: false,
      regNonce: res.nonce,
      txBytes: res.txBytes,
    };
  }
  if (res.reason === "build_failed") {
    // Idempotent: a re-register aborts at build-time simulation.
    if (isAlreadyRegisteredError(res.message)) {
      return { ok: true, alreadyRegistered: true };
    }
    return { ok: false, reason: "build_failed" };
  }
  return { ok: false, reason: "unconfigured" };
}

export type SubmitResult =
  | { ok: true; digest: string; alreadyRegistered: boolean }
  | {
      ok: false;
      reason: "unconfigured" | "expired" | "failed";
      error?: string;
    };

export async function submitSponsoredRegister(opts: {
  regNonce: string;
  address: string;
  agentSignature: string;
}): Promise<SubmitResult> {
  const res = await submitSponsoredTx({
    nonce: opts.regNonce,
    actor: opts.address,
    actorSignature: opts.agentSignature,
  });
  if (res.ok) {
    return { ok: true, digest: res.digest, alreadyRegistered: false };
  }
  // A Move-abort at submit = registered between prepare + submit (race) →
  // idempotent success.
  if (res.reason === "aborted") {
    return { ok: true, digest: res.digest, alreadyRegistered: true };
  }
  if (res.reason === "expired") {
    return { ok: false, reason: "expired" };
  }
  if (res.reason === "failed") {
    return { ok: false, reason: "failed", error: res.message };
  }
  return { ok: false, reason: "unconfigured" };
}
