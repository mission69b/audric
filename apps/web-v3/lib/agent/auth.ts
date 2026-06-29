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
