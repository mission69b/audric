import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SUI_NETWORK } from "@/lib/audric-web";
import { parseAmountToRaw, SUI_DECIMALS } from "./amount";
import { buildSuiTransferTx } from "./build";
import { isProofExpired, loadWalletKeys } from "./keys";
import {
  clearSendDispatched,
  hydrateDedup,
  isDuplicateSend,
  markSendDispatched,
  persistDedup,
  preflightSend,
  sendDedupKey,
} from "./screen";
import { ZkLoginSigner } from "./signer";

// gRPC is the migrated transport (JSON-RPC fullnodes sunset 2026-07-31); the same
// SuiGrpcClient builds the tx and broadcasts via the unified `core.*` API — exactly
// as web-v3's send path does in the browser. Here it runs on-device (Hermes).
function grpcClient(): SuiGrpcClient {
  const baseUrl =
    SUI_NETWORK === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network: SUI_NETWORK });
}

// Build → sign (zkLogin) → broadcast a gas-native SUI transfer on the configured
// network. Every failure throws with a user-facing message; the caller surfaces it.
//
// Dedup lifecycle (money-safety) is owned ENTIRELY here — the store must never touch
// the lock. The invariant: once `executeTransaction` has been INVOKED for a value, the
// 60s lock for that value stays held no matter what happens after (success, revert, or
// an ambiguous post-broadcast throw such as a network error or wait timeout), so a
// Retry can never re-broadcast the same value. The lock is released only when a throw
// happened strictly BEFORE `executeTransaction` was invoked (nothing was broadcast).
export async function sendSui(input: {
  to: string;
  /** RAW human text (e.g. "0.1"); parsed to exact base units — never a pre-rounded float. */
  amount: string;
  /** The address this send session authenticated as; must match the on-device keys. */
  expectedAddress: string;
}): Promise<{ digest: string }> {
  // Hard gate: Real Send is testnet-only until Phase-0 mainnet parity is deliberately
  // lifted. This makes a mainnet broadcast impossible regardless of misconfiguration.
  if (SUI_NETWORK !== "testnet") {
    throw new Error("Real Send is testnet-only pending Phase-0 parity.");
  }

  // Exact string→base-units. Rejects sub-unit precision (e.g. "0.0000000015" SUI)
  // rather than silently rounding it into a different on-chain amount.
  const parsed = parseAmountToRaw(input.amount, SUI_DECIMALS);
  if (!parsed.ok) {
    throw new Error(parsed.reason);
  }
  const amountRaw = parsed.raw;

  const screen = preflightSend({ to: input.to, amountRaw, asset: "SUI" });
  if (!screen.ok) {
    throw new Error(screen.reason);
  }

  const keys = await loadWalletKeys();
  if (!keys) {
    throw new Error("Sign in to send.");
  }
  // Wrong-account guard: a failed/absent proof at sign-in can leave a PREVIOUS account's
  // keys in SecureStore. If they don't match the address this session authenticated as,
  // refuse — signing here would move the wrong wallet's money. Compare case-insensitively
  // (zkLogin addresses are lowercase, but never trust the caller's casing).
  if (keys.address.toLowerCase() !== input.expectedAddress.toLowerCase()) {
    throw new Error("Wallet session changed — sign in again to send.");
  }
  if (isProofExpired(keys)) {
    throw new Error("Your session expired — sign in again.");
  }

  const key = sendDedupKey({
    network: SUI_NETWORK,
    sender: keys.address,
    to: input.to,
    amountRaw,
    asset: "SUI",
  });

  // Durable + atomic dedup. Pull any marks persisted before a restart back into memory
  // FIRST, then run the duplicate check and the reservation as ONE synchronous step (no
  // `await` between them) so two concurrent sends can't both pass the check before either
  // marks. `persistDedup` then writes the reservation durably before we broadcast.
  await hydrateDedup();
  if (isDuplicateSend(key)) {
    // A matching send is still inside the window. Throw WITHOUT touching the lock — the
    // prior send owns it, and clearing it here would re-enable a second broadcast.
    throw new Error("This transfer was just sent — wait a moment before retrying.");
  }
  markSendDispatched(key);
  await persistDedup();

  const client = grpcClient();
  const signer = new ZkLoginSigner(
    Ed25519Keypair.fromSecretKey(keys.ephemeralSecret),
    keys.proof,
    keys.address,
    keys.maxEpoch
  );

  // The lock is now held. It is released ONLY if we throw before `executeTransaction` is
  // actually invoked (build/sign failure = nothing broadcast); `executeInvoked` flips true
  // the instant we call it, so any error thereafter (network, timeout, revert) keeps the
  // lock so a Retry can't re-broadcast the same value.
  let executeInvoked = false;
  try {
    const tx = buildSuiTransferTx({ sender: keys.address, to: input.to, amountRaw });
    const bytes = await tx.build({ client });
    const { signature } = await signer.signTransaction(bytes);
    executeInvoked = true;
    const result = await client.core.executeTransaction({
      transaction: bytes,
      signatures: [signature],
      include: { effects: true },
    });
    const txn =
      result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;

    // The broadcast returned a digest, so the send is FINAL. The only post-broadcast
    // condition that surfaces as an error is a deterministic on-chain revert: effects
    // present AND status.success === false. `status.error` is an object
    // ({ $kind, message, ... } from the SDK's parseGrpcExecutionError) — interpolate
    // its `.message`, never the object itself.
    if (txn.effects && txn.effects.status?.success === false) {
      throw new Error(
        `Transfer failed: ${txn.effects.status.error?.message ?? "unknown error"}`
      );
    }

    // Confirmation only — web-v3's send path does not even wait. A rejection here
    // (network blip / wait timeout) is non-authoritative and must NOT flip a landed
    // tx into an error; swallow it and still return the digest (lock stays held).
    try {
      await client.core.waitForTransaction({ digest: txn.digest });
    } catch (waitErr) {
      console.warn(
        "[send] waitForTransaction failed (non-fatal, tx already broadcast):",
        waitErr instanceof Error ? waitErr.message : String(waitErr)
      );
    }

    return { digest: txn.digest };
  } catch (err) {
    // Release the lock ONLY when nothing was broadcast (threw before we invoked
    // executeTransaction). Once invoked, the lock stays held even on an ambiguous
    // failure so Retry can't double-send. Mirror the release to the durable store.
    if (!executeInvoked) {
      clearSendDispatched(key);
      await persistDedup();
    }
    throw err;
  }
}
