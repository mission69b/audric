/**
 * Custody classifier — follow-up to the DeFi-removal audit
 * (SPEC_AUDRIC_DEFI_REMOVAL §2d step 1).
 *
 * The User table can contain EXTERNAL wallets: pre-SPEC-30-Phase-1A the
 * /api/user/status upsert accepted any (valid JWT, arbitrary address)
 * pair, so legacy rows exist for self-custodied wallets (found via the
 * founder's own funkii.sui row). Those wallets are NOT strandable by
 * the DeFi removal — their owner can unwind NAVI from any wallet app.
 *
 * Discriminator: a zkLogin-derived address can ONLY produce zkLogin
 * sender signatures (serialized-signature flag byte 0x05 → base64
 * prefix "BQ"). One outbound tx per wallet classifies it:
 *   - zklogin   → Audric Passport wallet (owed the §2d exit window)
 *   - external  → self-custodied (ed25519/secp256k1/multisig sender sig)
 *   - no-outbound-tx → never transacted; unclassifiable but also has
 *     nothing to unwind on-chain via Audric (receive-only)
 *
 * Reads the audit JSON, classifies the cohort wallets only (~63 RPC
 * calls), and writes custody-<date>.json next to it.
 *
 * Run (from apps/web-v2):
 *   node --experimental-transform-types \
 *     --import ./scripts/audit-register.mjs \
 *     scripts/classify-wallet-custody.mts
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(here, "..", ".env.local") });
loadEnv({ path: path.join(here, "..", ".env") });

const OUT_DIR =
  process.env.AUDIT_OUT_DIR ??
  "/Users/funkii/dev/t2000/spec/active/defi-removal-audit";
const AUDIT_JSON =
  process.env.AUDIT_JSON ?? path.join(OUT_DIR, "audit-2026-06-09.json");

const { getSuiRpcUrl } = await import("../lib/sui-rpc.ts");
const RPC_URL = getSuiRpcUrl();

interface AuditWalletRow {
  address: string;
  lastActiveAt: string | null;
  naviBorrowsUsd: number;
  naviSavingsUsd: number;
  nonUsdcHoldings: { symbol: string; usdValue: number | null }[];
  username: string | null;
}

const nonUsdcTotal = (row: AuditWalletRow) =>
  Math.round(
    row.nonUsdcHoldings.reduce((s, h) => s + (h.usdValue ?? 0), 0) * 100
  ) / 100;

const audit = JSON.parse(readFileSync(AUDIT_JSON, "utf8")) as {
  cohortA: AuditWalletRow[];
  cohortB: AuditWalletRow[];
};

const wallets = new Map<string, AuditWalletRow>();
for (const row of [...audit.cohortA, ...audit.cohortB]) {
  wallets.set(row.address, row);
}
console.log(
  `[custody] classifying ${wallets.size} cohort wallet(s) via ${RPC_URL}`
);

let rpcId = 0;
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!res.ok) {
    throw new Error(`RPC ${method} HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (body.error) {
    throw new Error(`RPC ${method}: ${body.error.message}`);
  }
  return body.result as T;
}

type Custody = "zklogin" | "external" | "no-outbound-tx" | "error";

/**
 * Signature scheme flag = first byte of the base64 serialized signature.
 * 0x00 ed25519, 0x01 secp256k1, 0x02 secp256r1, 0x03 multisig,
 * 0x05 zklogin, 0x06 passkey.
 */
function schemeOf(signatureB64: string): number {
  return Buffer.from(signatureB64, "base64")[0] ?? -1;
}

async function classify(address: string): Promise<{
  custody: Custody;
  schemes: number[];
}> {
  try {
    const result = await rpc<{
      data: { transaction?: { txSignatures?: string[] } }[];
    }>("suix_queryTransactionBlocks", [
      {
        filter: { FromAddress: address },
        options: { showInput: true },
      },
      null,
      3,
      true, // descending — most recent first
    ]);
    if (result.data.length === 0) {
      return { custody: "no-outbound-tx", schemes: [] };
    }
    const schemes = new Set<number>();
    for (const tx of result.data) {
      for (const sig of tx.transaction?.txSignatures ?? []) {
        schemes.add(schemeOf(sig));
      }
    }
    // Sponsored (Enoki) txs carry sender zkLogin sig + sponsor ed25519
    // sig on the same tx — ANY zkLogin sig from this sender proves the
    // address is zkLogin-derived (a zkLogin address cannot sign any
    // other way, and no other scheme can sign for it).
    const custody: Custody = schemes.has(0x05) ? "zklogin" : "external";
    return { custody, schemes: [...schemes] };
  } catch (error) {
    console.error(`[custody] RPC failed for ${address}:`, error);
    return { custody: "error", schemes: [] };
  }
}

const out: Record<
  string,
  AuditWalletRow & { custody: Custody; sigSchemes: number[] }
> = {};
for (const [address, row] of wallets) {
  const { custody, schemes } = await classify(address);
  out[address] = { ...row, custody, sigSchemes: schemes };
  await new Promise((r) => setTimeout(r, 150));
}

const byCustody = (c: Custody) =>
  Object.values(out).filter((w) => w.custody === c);
const summary = {
  generatedAt: new Date().toISOString(),
  totalCohortWallets: wallets.size,
  zklogin: byCustody("zklogin").length,
  external: byCustody("external").length,
  noOutboundTx: byCustody("no-outbound-tx").length,
  errors: byCustody("error").length,
};

const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(OUT_DIR, `custody-${stamp}.json`);
writeFileSync(outPath, JSON.stringify({ summary, wallets: out }, null, 2));

console.log(JSON.stringify(summary, null, 2));
console.log("\n[custody] EXTERNAL wallets (no exit owed):");
for (const w of byCustody("external")) {
  console.log(
    `  ${w.address} user=${w.username} navi=$${w.naviSavingsUsd + w.naviBorrowsUsd} nonUsdc=$${nonUsdcTotal(w)}`
  );
}
console.log(`\n[custody] written: ${outPath}`);
