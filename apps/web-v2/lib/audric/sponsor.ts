/**
 * Sponsorship strategies — one reusable seam, two implementations.
 *
 * Every Audric write is a *sponsored* transaction: the user (zkLogin)
 * signs it, but someone else pays the SUI gas so the user never needs
 * SUI. Historically that sponsor was always Enoki. But Enoki's gas
 * station can't deserialize a transaction that withdraws from a user's
 * **address balance** (Sui's account-style balance — where funds land
 * after a `0x2::balance::send_funds` transfer or a send from a modern
 * wallet). See MystenLabs/sui#22306. So writes whose funds live only in
 * address balance fail at Enoki with "Invalid bcs bytes for TransactionData".
 *
 * The fix: for those writes only, **we** pay the gas from a dedicated
 * sponsor wallet and submit straight to the fullnode — which has no
 * trouble with the address-balance withdrawal command. Coin-object
 * writes keep going through Enoki unchanged (it manages gas-coin
 * pooling at volume for free).
 *
 * The two strategies share one `Sponsor` interface so the prepare /
 * execute routes carry zero duplicated orchestration — they pick a
 * strategy and call `prepare()` / `execute()`. The `mode` discriminator
 * round-trips through the client so `/execute` re-selects the same
 * strategy.
 *
 *   - `enokiSponsor` — coin-object writes. Forwards to Enoki's REST
 *     sponsor + execute endpoints (the pre-existing path, extracted).
 *   - `selfSponsor`  — address-balance writes. Sets gasOwner = our
 *     sponsor wallet, signs the gas, submits both signatures to Sui.
 *
 * Removal path: when Enoki ships address-balance support, delete
 * `selfSponsor` + the router fallback in `/prepare` — one block, no
 * caller churn.
 */

import type { ComposeTxResult } from "@t2000/sdk";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, SUI_TYPE_ARG, toBase64 } from "@mysten/sui/utils";
import { extractMoveCallTargets } from "@/lib/audric/extract-move-call-targets";
import { redactAddressesInText } from "@/lib/audric/log-redact";
import { env } from "@/lib/env";

const ENOKI_BASE = "https://api.enoki.mystenlabs.com/v1";

/**
 * Fixed gas budget for self-sponsored writes (0.1 SUI). Generous enough
 * to cover the heaviest path (a multi-pool Cetus swap) — unused gas is
 * refunded to the sponsor, so over-budgeting is free. Setting it
 * explicitly avoids a dry-run round-trip at build time.
 */
const SELF_SPONSOR_GAS_BUDGET = 100_000_000n;

export type SponsorMode = "enoki" | "self";

export interface SponsorPrepareInput {
  composed: ComposeTxResult;
  sender: string;
  client: SuiJsonRpcClient;
  network: string;
  /** zkLogin JWT — Enoki binds the sponsored tx to the user's session. */
  jwt?: string | null;
}

export interface SponsorPrepareResult {
  /** Base64 tx bytes the client signs with its zkLogin key. */
  bytes: string;
  digest: string;
  mode: SponsorMode;
  /** Self mode only — the sponsor's gas signature, round-tripped to
   * `/execute` via the client (not secret; it's a signature over this
   * exact tx). */
  sponsorSignature?: string;
}

export interface SponsorExecuteInput {
  client: SuiJsonRpcClient;
  digest: string;
  /** User's zkLogin signature over the prepared bytes. */
  signature: string;
  /** Self mode only. */
  bytes?: string;
  sponsorSignature?: string;
}

export interface SponsorExecuteResult {
  digest: string;
  balanceChanges: unknown[];
  objectChanges: unknown[];
}

export interface Sponsor {
  readonly mode: SponsorMode;
  prepare(input: SponsorPrepareInput): Promise<SponsorPrepareResult>;
  execute(input: SponsorExecuteInput): Promise<SponsorExecuteResult>;
}

// ─── Enoki strategy (coin-object writes) ──────────────────────────────

function parseEnokiError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ message?: string }>;
      message?: string;
    };
    return (
      parsed.errors?.[0]?.message ??
      parsed.message ??
      `Sponsorship failed (${status})`
    );
  } catch {
    return `Sponsorship failed (${status})`;
  }
}

export class EnokiSponsorError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EnokiSponsorError";
    this.status = status;
  }
}

/** Tx was submitted but didn't settle in a confirmed checkpoint in time.
 * Carries the digest so the client can poll / narrate "still pending". */
export class SponsorSettlementError extends Error {
  readonly digest: string;
  constructor(message: string, digest: string) {
    super(message);
    this.name = "SponsorSettlementError";
    this.digest = digest;
  }
}

export const enokiSponsor: Sponsor = {
  mode: "enoki",

  async prepare({ composed, sender, network, jwt }) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${env.ENOKI_SECRET_KEY}`,
      "Content-Type": "application/json",
    };
    if (jwt) {
      headers["zklogin-jwt"] = jwt;
    }

    const moveCallTargets = extractMoveCallTargets(composed.tx);
    const allowedAddresses = Array.from(
      new Set([...composed.derivedAllowedAddresses, sender])
    );
    const sponsorBody: Record<string, unknown> = {
      network,
      transactionBlockKindBytes: toBase64(composed.txKindBytes),
      sender,
      allowedAddresses,
    };
    if (moveCallTargets.length > 0) {
      sponsorBody.allowedMoveCallTargets = moveCallTargets;
    }

    const res = await fetch(`${ENOKI_BASE}/transaction-blocks/sponsor`, {
      method: "POST",
      headers,
      body: JSON.stringify(sponsorBody),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.error(
        `[sponsor:enoki] sponsor error (${res.status}):`,
        redactAddressesInText(errorBody)
      );
      throw new EnokiSponsorError(
        parseEnokiError(errorBody, res.status),
        res.status
      );
    }

    const { data } = (await res.json()) as {
      data: { bytes: string; digest: string };
    };
    return { bytes: data.bytes, digest: data.digest, mode: "enoki" };
  },

  async execute({ client, digest, signature }) {
    const res = await fetch(
      `${ENOKI_BASE}/transaction-blocks/sponsor/${encodeURIComponent(digest)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.ENOKI_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signature }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.error(
        `[sponsor:enoki] execute error (${res.status}):`,
        redactAddressesInText(errorBody)
      );
      if (res.status === 404) {
        throw new EnokiSponsorError(
          "Sponsored transaction expired or not found",
          404
        );
      }
      throw new EnokiSponsorError(
        parseEnokiError(errorBody, res.status),
        res.status >= 500 ? 502 : res.status
      );
    }

    const payload = (await res.json()) as { data: { digest: string } };
    return settle(client, payload.data.digest);
  },
};

// ─── Self-sponsor strategy (address-balance writes) ───────────────────

let cachedKeypair: Ed25519Keypair | null = null;

/** Lazily decode the sponsor keypair. Returns null when the env var is
 * unset — callers degrade to the `ADDRESS_BALANCE_UNSPONSORABLE` error
 * (coin-object writes via Enoki are unaffected). */
export function getSponsorKeypair(): Ed25519Keypair | null {
  if (cachedKeypair) {
    return cachedKeypair;
  }
  const raw = env.SPONSOR_PRIVATE_KEY;
  if (!raw) {
    return null;
  }
  const { secretKey } = decodeSuiPrivateKey(raw);
  cachedKeypair = Ed25519Keypair.fromSecretKey(secretKey);
  return cachedKeypair;
}

export const selfSponsor: Sponsor = {
  mode: "self",

  async prepare({ composed, sender, client }) {
    const keypair = getSponsorKeypair();
    if (!keypair) {
      throw new Error("Self-sponsor wallet not configured");
    }
    const sponsorAddress = keypair.getPublicKey().toSuiAddress();

    // Rebuild from the kind bytes so we get a clean full build (composeTx
    // already ran `build({ onlyTransactionKind: true })` on its own tx).
    const tx = Transaction.fromKind(composed.txKindBytes);
    tx.setSender(sender);
    tx.setGasOwner(sponsorAddress);
    tx.setGasBudget(SELF_SPONSOR_GAS_BUDGET);

    const sponsorCoins = await client.getCoins({
      owner: sponsorAddress,
      coinType: SUI_TYPE_ARG,
    });
    if (sponsorCoins.data.length === 0) {
      throw new Error("Self-sponsor wallet has no SUI to pay gas");
    }
    tx.setGasPayment(
      sponsorCoins.data.map((c) => ({
        objectId: c.coinObjectId,
        version: c.version,
        digest: c.digest,
      }))
    );

    const bytes = await tx.build({ client });
    const { signature: sponsorSignature } =
      await keypair.signTransaction(bytes);
    const digest = await tx.getDigest({ client });

    return {
      bytes: toBase64(bytes),
      digest,
      mode: "self",
      sponsorSignature,
    };
  },

  async execute({ client, bytes, signature, sponsorSignature }) {
    if (!(bytes && sponsorSignature)) {
      throw new Error(
        "Self-sponsor execute requires bytes + sponsorSignature"
      );
    }
    const res = await client.executeTransactionBlock({
      transactionBlock: fromBase64(bytes),
      // Order is irrelevant to Sui — both the sender (zkLogin) and the
      // gas sponsor signatures must be present.
      signature: [signature, sponsorSignature],
      options: { showEffects: true },
    });
    return settle(client, res.digest);
  },
};

// ─── Shared settlement ────────────────────────────────────────────────

/** Wait for the digest to settle in a confirmed checkpoint and return
 * the changes the LLM tool-result narration needs. Shared by both
 * strategies — the one place the post-submit logic lives. */
async function settle(
  client: SuiJsonRpcClient,
  digest: string
): Promise<SponsorExecuteResult> {
  let txResult: Awaited<ReturnType<typeof client.waitForTransaction>>;
  try {
    txResult = await client.waitForTransaction({
      digest,
      options: {
        showEffects: true,
        showBalanceChanges: true,
        showObjectChanges: true,
      },
    });
  } catch (err) {
    throw new SponsorSettlementError(
      err instanceof Error
        ? err.message
        : "Transaction submitted but settlement timed out",
      digest
    );
  }
  return {
    digest,
    balanceChanges: txResult.balanceChanges ?? [],
    objectChanges: txResult.objectChanges ?? [],
  };
}

// ─── Registry ─────────────────────────────────────────────────────────

const SPONSORS: Record<SponsorMode, Sponsor> = {
  enoki: enokiSponsor,
  self: selfSponsor,
};

export function getSponsor(mode: SponsorMode): Sponsor {
  return SPONSORS[mode];
}
