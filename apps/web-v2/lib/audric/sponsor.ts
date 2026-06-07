/**
 * Sponsorship — Enoki, the single path.
 *
 * Every Audric write is a *sponsored* transaction: the user (zkLogin)
 * signs it, but Enoki's gas station pays the SUI gas so the user never
 * needs SUI.
 *
 * [S.375 — 2026-06-07] Reverted to the single Enoki path. Historically
 * there was a second `selfSponsor` strategy because Enoki's gas station
 * couldn't deserialize a transaction that withdraws from a user's
 * **address balance** (the `FundsWithdrawal` reservation `coinWithBalance`
 * emits — MystenLabs/sui#26852). Mysten fixed the gas station 2026-06-03
 * (issue closed), so address-balance writes go back through Enoki and the
 * self-sponsor wallet (+ its hot `SPONSOR_PRIVATE_KEY`, the dual `mode`
 * discriminator, and the `sponsorSignature` round-trip) is deleted.
 *
 * Known thin edge (accepted): a SUI-in-address-balance send still can't be
 * Enoki-sponsored because `coinWithBalance({ type: SUI })` references the
 * gas coin, which Enoki rejects ("Cannot use GasCoin as a transaction
 * argument" — S.260, a SEPARATE constraint from the FundsWithdrawal fix).
 * It fails with a clean Enoki error. Every stable path (USDC/USDsui sends,
 * NAVI saves/withdraws from received funds) works. A full fix is the
 * SDK-side `sponsoredContext` collapse — deferred.
 */

import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { toBase64 } from "@mysten/sui/utils";
import type { ComposeTxResult } from "@t2000/sdk";
import { extractMoveCallTargets } from "@/lib/audric/extract-move-call-targets";
import { redactAddressesInText } from "@/lib/audric/log-redact";
import { env } from "@/lib/env";

const ENOKI_BASE = "https://api.enoki.mystenlabs.com/v1";

export interface SponsorPrepareInput {
  client: SuiJsonRpcClient;
  composed: ComposeTxResult;
  /** zkLogin JWT — Enoki binds the sponsored tx to the user's session. */
  jwt?: string | null;
  network: string;
  sender: string;
}

export interface SponsorPrepareResult {
  /** Base64 tx bytes the client signs with its zkLogin key. */
  bytes: string;
  digest: string;
}

export interface SponsorExecuteInput {
  client: SuiJsonRpcClient;
  digest: string;
  /** User's zkLogin signature over the prepared bytes. */
  signature: string;
}

export interface SponsorExecuteResult {
  balanceChanges: unknown[];
  digest: string;
  objectChanges: unknown[];
}

export interface Sponsor {
  execute(input: SponsorExecuteInput): Promise<SponsorExecuteResult>;
  prepare(input: SponsorPrepareInput): Promise<SponsorPrepareResult>;
}

// ─── Enoki sponsor (the single path) ──────────────────────────────────

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
    return { bytes: data.bytes, digest: data.digest };
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

// ─── Settlement ───────────────────────────────────────────────────────

/** Wait for the digest to settle in a confirmed checkpoint and return
 * the changes the LLM tool-result narration needs. */
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
