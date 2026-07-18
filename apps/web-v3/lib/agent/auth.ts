import "server-only";

import { normalizeSuiAddress } from "@mysten/sui/utils";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";

// Agent (keypair) signature auth — Agent ID Phase A. A keypair proves it owns
// its Sui address by signing a server-issued challenge as a personal message
// (the same primitive as "sign in with a Sui wallet"). The message is bound to
// the ACTION (key-mint) so a signature can't be replayed against a different
// endpoint.

/** The exact message the agent must sign to mint a key for `nonce`. Action-
 *  bound so a topup/other signature can never be redirected to key-minting. */
export function agentKeyChallengeMessage(nonce: string): string {
  return `t2000-agent-keys:${nonce}`;
}

/** The message to sign to claim `<label>.agent-id.sui`. Bound to BOTH the nonce
 *  AND the label, so a captured signature can't be redirected to a different
 *  handle (or to key-minting). */
export function agentHandleChallengeMessage(
  nonce: string,
  label: string
): string {
  return `t2000-agent-handle:${nonce}:${label}`;
}

/** The message to sign to release (revoke) `<label>.agent-id.sui`. Distinct
 *  action prefix so a claim signature can't be replayed to release. */
export function agentHandleReleaseChallengeMessage(
  nonce: string,
  label: string
): string {
  return `t2000-agent-handle-release:${nonce}:${label}`;
}

/** The message to sign to edit the agent's (DB-backed) display profile. */
export function agentProfileChallengeMessage(nonce: string): string {
  return `t2000-agent-profile:${nonce}`;
}

/** The message to sign to replace the agent's service CATALOG (Store v2
 *  Phase 1). Bound to nonce + a sha256 of the canonical services JSON, so a
 *  captured signature can't be replayed with a different catalog payload. */
export function agentServicesChallengeMessage(
  nonce: string,
  servicesSha256Hex: string
): string {
  return `t2000-agent-services:${nonce}:${servicesSha256Hex}`;
}

/** The message to sign to mutate the agent's OFFERINGS (t2 ACP Phase 1 —
 *  upsert or retire). Bound to nonce + a sha256 of the canonical action
 *  payload, so a captured signature can't be replayed with a different
 *  offering (same construction as the services-catalog message). */
export function agentOfferingChallengeMessage(
  nonce: string,
  payloadSha256Hex: string
): string {
  return `t2000-agent-offering:${nonce}:${payloadSha256Hex}`;
}

/** The message to sign to review a RELEASED escrow Job (t2 ACP Phase 1 —
 *  receipt-bound star reviews, the Job object id is the receipt). Bound to
 *  nonce + a sha256 of the canonical review payload {jobId, stars, text}, so
 *  a captured signature can't be replayed with different stars or text. */
export function agentJobReviewChallengeMessage(
  nonce: string,
  payloadSha256Hex: string
): string {
  return `t2000-job-review:${nonce}:${payloadSha256Hex}`;
}

/** Verify a Sui personal-message signature proves ownership of `address`. */
export async function verifyAgentSignature(opts: {
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(opts.message);
    const publicKey = await verifyPersonalMessageSignature(
      bytes,
      opts.signature
    );
    return publicKey.toSuiAddress() === normalizeSuiAddress(opts.address);
  } catch {
    return false;
  }
}
