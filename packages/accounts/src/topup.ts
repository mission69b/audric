import "server-only";

import { normalizeSuiAddress } from "@mysten/sui/utils";
import { queryTransaction } from "@t2000/sdk";
import {
  acceptClosedLoopTerms,
  getCreditBalanceMicros,
  recordCredit,
} from "./queries";

/**
 * Stablecoin → credit top-up (the crypto-native funding rail, shared by Audric
 * + the t2000 console — SPEC_T2000_API_V2 §5a / parked S.396).
 *
 * The client signs a gasless USDC/USDsui transfer from the user's Passport to
 * the treasury and hands us the digest. We are the SOURCE OF TRUTH for the
 * grant: we re-read the transaction on-chain (never trust a client-claimed
 * amount OR asset), confirm it was a $1-stable payment from this user to the
 * treasury, and credit the exact on-chain amount. Idempotent on the digest, so
 * a double-submit or a retry after indexer lag is a no-op (Stripe-webhook
 * model).
 *
 * One treasury (`T2000_TREASURY`, default = the gateway treasury) receives all
 * inbound credit funding — USDC, USDsui, and x402 top-ups — per the 2026-06-29
 * wallet-consolidation decision. Rebates + swap-fee wallets stay separate.
 */

const USD_TO_MICROS = 1_000_000;
// A freshly-executed tx can lag the GraphQL indexer by a few seconds.
const LOOKUP_ATTEMPTS = 6;
const LOOKUP_DELAY_MS = 1500;

// The canonical t2000 inbound treasury (gateway treasury). Override via env for
// testnet/dev; production uses this mainnet address. Both USDC + USDsui are
// $1-pegged Sui-native stables, credited 1:1.
const DEFAULT_TREASURY =
  "0xb012ac774bee4ee6e4e571a13457eeb7a75c4f2319551bf9d436fd497d57aca1";
const CREDITABLE_STABLES = new Set(["USDC", "USDSUI"]);

/** The treasury wallet credit top-ups are sent to. */
export function getTreasuryAddress(): string {
  return process.env.T2000_TREASURY ?? DEFAULT_TREASURY;
}

export type StablecoinTopupResult =
  | {
      ok: true;
      /** false = this digest was already credited (idempotent replay). */
      applied: boolean;
      amountUsd: number;
      asset: string;
      balanceMicros: number;
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "not_stable"
        | "not_outbound"
        | "wrong_recipient"
        | "too_small";
      error: string;
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Verify a USDC/USDsui payment on-chain and credit the sender's balance.
 *
 * @param userId  the sender's Sui address (= the Passport / `User.id`)
 * @param digest  the transaction digest returned by the client's send
 */
export async function recordStablecoinTopup(opts: {
  userId: string;
  digest: string;
}): Promise<StablecoinTopupResult> {
  const treasury = normalizeSuiAddress(getTreasuryAddress());
  const sender = opts.userId;

  // Parse from the SENDER's perspective: a stablecoin `out` leg proves the
  // sender's own balance decreased (i.e. they signed it), and the counterparty
  // recipient must be the treasury. Retry briefly for indexer lag — and treat a
  // thrown GraphQL/network error as retryable, NOT a hard failure: the user has
  // already paid on-chain, so a transient read blip must end in a retryable
  // "not confirmed yet" (the client re-submits; crediting is idempotent on the
  // digest), never a 500 that strands a paid user.
  let record: Awaited<ReturnType<typeof queryTransaction>> = null;
  for (let i = 0; i < LOOKUP_ATTEMPTS; i++) {
    try {
      record = await queryTransaction(opts.digest, sender);
    } catch {
      record = null;
    }
    if (record) {
      break;
    }
    if (i < LOOKUP_ATTEMPTS - 1) {
      await sleep(LOOKUP_DELAY_MS);
    }
  }
  if (!record) {
    return {
      ok: false,
      code: "not_found",
      error: "Payment not confirmed yet — wait a moment and try again.",
    };
  }

  const asset = (record.asset ?? "").toUpperCase();
  if (!CREDITABLE_STABLES.has(asset)) {
    return {
      ok: false,
      code: "not_stable",
      error: "That transaction didn't transfer USDC or USDsui.",
    };
  }
  if (record.direction !== "out") {
    return {
      ok: false,
      code: "not_outbound",
      error: "That transaction isn't a payment from your Passport.",
    };
  }
  if (!record.recipient || normalizeSuiAddress(record.recipient) !== treasury) {
    return {
      ok: false,
      code: "wrong_recipient",
      error: "That payment didn't go to the t2000 treasury.",
    };
  }
  const amountUsd = record.amount ?? 0;
  if (amountUsd <= 0) {
    return {
      ok: false,
      code: "too_small",
      error: "No stablecoin amount detected in that transaction.",
    };
  }

  // USDC + USDsui are both $1-pegged with 6 decimals → 1 token = $1 credit.
  const applied = await recordCredit({
    userId: sender,
    amountMicros: Math.round(amountUsd * USD_TO_MICROS),
    type: "topup",
    description: `${record.asset} top-up — ${amountUsd} ${record.asset}`,
    ref: `topup:${opts.digest}`,
  });
  if (applied) {
    // First top-up doubles as closed-loop terms acceptance (parity with card).
    await acceptClosedLoopTerms(sender).catch(() => undefined);
  }

  const balanceMicros = await getCreditBalanceMicros(sender);
  return {
    ok: true,
    applied,
    amountUsd,
    asset: record.asset ?? asset,
    balanceMicros,
  };
}
