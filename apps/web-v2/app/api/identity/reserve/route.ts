import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { SuinsClient } from "@mysten/suins";
import { resolveSuinsViaRpc, SuinsRpcError } from "@t2000/engine";
import { buildAddLeafTx, buildRevokeLeafTx, fullHandle } from "@t2000/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { assertOwns, authenticateRequest } from "@/lib/audric-auth";
import { env } from "@/lib/env";
import {
  admissionRejectedResponse,
  tryAdmitMint,
} from "@/lib/identity/admission-control";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";
import { Prisma, prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withSuiRetry } from "@/lib/sui-retry";
import { createSuiRpcClient, getSuiRpcUrl } from "@/lib/sui-rpc";
import { invalidateAndWarmSuins } from "@/lib/suins-cache";

/**
 * POST /api/identity/reserve
 *
 * Mints a `<label>.audric.sui` leaf subname pointing to the caller's wallet
 * and writes the resulting `username` to their `User` row. This is the
 * one-shot claim flow that turns a fresh signup into an Audric Passport
 * with a stable identity handle (per SPEC 10 v0.2.1 Phase B.2).
 *
 * ## Signing model (CANONICAL-BYPASS of composeTx)
 *
 * Per `audric-canonical-write.mdc:99` + SPEC 10 Phase A "service-account-signed"
 * callout: this route is NOT a Enoki-sponsored user-signed write. The signer
 * is the parent NFT custody address (`0xaca29165…23d11`, per RUNBOOK §1).
 * Bundle A locked 2026-05-05 (founder decision): the custody Ed25519 keypair
 * is loaded from `env.AUDRIC_PARENT_NFT_PRIVATE_KEY` (Bech32 `suiprivkey1…`)
 * and signs the leaf-mint PTB server-side. The custody address is pre-funded
 * with SUI for gas (~50 SUI initial pre-fund covers ~15k mints; refill annually).
 * NO Enoki involvement for this surface — Enoki sponsors user-signed writes only.
 *
 * ## Anti-race funnel (mirrors `/api/identity/check` for ground truth)
 *
 * 1. Length / charset / hyphen rules (cheap; pure)
 * 2. Reserved-name list (cheap; in-memory Set)
 * 3. SuiNS RPC ground truth (BEFORE the on-chain write — fail-CLOSED)
 * 4. Postgres `User.username` unique check (BEFORE the on-chain write)
 * 5. On-chain mint (parent-permissioned, single signer = our key, atomic)
 * 6. Postgres write under transaction. P2002 → revoke the leaf and 409.
 *
 * [v0.7e Phase 2 / S.253 — 2026-05-22] Verbatim port from
 * apps/web/app/api/identity/reserve/route.ts. Changes vs source:
 *   - `@/lib/auth` → `@/lib/audric-auth` (web-v2's consolidated module).
 *   - `Prisma` type imported from `@/lib/prisma` (re-export) instead of
 *     the generated-client path (which lives in apps/web).
 *   - `runtime` segment export dropped (cacheComponents-incompatible).
 *   - Everything else — `withSuiRetry`, `tryAdmitMint`,
 *     `invalidateAndWarmSuins`, SuiNS RPC, parent-NFT keypair loader —
 *     ported alongside this route into web-v2 in the same diff
 *     (see lib/sui-retry.ts, lib/identity/admission-control.ts,
 *     lib/suins-cache.ts UpstashSuinsCacheStore additions).
 */

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK as "mainnet" | "testnet";

type ReserveReason =
  | "invalid"
  | "too-short"
  | "too-long"
  | "reserved"
  | "taken";

interface ReserveSuccessBody {
  fullHandle: string;
  label: string;
  success: true;
  txDigest: string;
  walletAddress: string;
}

interface ReserveErrorBody {
  error: string;
  reason?: ReserveReason;
}

function errorResponse(
  error: string,
  status: number,
  reason?: ReserveReason
): NextResponse {
  const body: ReserveErrorBody = reason ? { error, reason } : { error };
  return NextResponse.json(body, { status });
}

/**
 * Lazy custody-keypair loader. Pulled out of module-load so missing-env
 * doesn't crash route imports — instead the route returns 503 at request
 * time, matching the "feature degrades, app boots" pattern.
 */
function loadCustodyKeypair(): Ed25519Keypair | null {
  const rawKey = env.AUDRIC_PARENT_NFT_PRIVATE_KEY;
  if (!rawKey) {
    return null;
  }
  try {
    const { scheme, secretKey } = decodeSuiPrivateKey(rawKey);
    if (scheme !== "ED25519") {
      console.error(
        `[reserve] Expected ED25519 keypair, got scheme "${scheme}"`
      );
      return null;
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch (err) {
    console.error(
      "[reserve] Failed to decode AUDRIC_PARENT_NFT_PRIVATE_KEY:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // [SPEC 30 Phase 1A.3] Bind body.address to verified JWT identity to
  // prevent the attacker-swaps-victim-address class — the reporter's PoC
  // could mint `<label>.audric.sui` pointing at a victim's wallet,
  // burning Audric's gas pre-fund AND planting an attacker-controlled
  // username on the victim's wallet.
  const auth = await authenticateRequest(req);
  if ("error" in auth) {
    return auth.error;
  }

  let body: { label?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (typeof body.address !== "string" || !isValidSuiAddress(body.address)) {
    return errorResponse("Invalid address", 400);
  }
  const callerAddress = normalizeSuiAddress(body.address);

  const ownership = assertOwns(auth.verified, callerAddress);
  if (ownership) {
    return ownership;
  }

  const validation = validateAudricLabel(body.label);
  if (!validation.valid) {
    return errorResponse(
      `Invalid username: ${validation.reason}`,
      400,
      validation.reason
    );
  }
  const label = validation.label;

  const rl = rateLimit(
    `identity-reserve:${callerAddress}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
  );
  if (!rl.success) {
    return rateLimitResponse(
      rl.retryAfterMs ?? RATE_LIMIT_WINDOW_MS
    ) as NextResponse;
  }

  if (isReserved(label)) {
    return errorResponse("Username is reserved", 400, "reserved");
  }

  const callerUser = await prisma.user.findUnique({
    where: { suiAddress: callerAddress },
    select: { id: true, username: true },
  });
  if (!callerUser) {
    return errorResponse("User not found — complete signup first", 404);
  }
  if (callerUser.username) {
    return errorResponse(
      "You already have a username. Use the change-username flow to update it.",
      400
    );
  }

  const keypair = loadCustodyKeypair();
  if (!keypair) {
    return errorResponse(
      "Username minting temporarily unavailable. Please try again shortly.",
      503
    );
  }

  const handle = fullHandle(label);
  const suiRpcUrl = getSuiRpcUrl();

  // [S18-F14] Admission control. Cap concurrent in-flight mints at 5
  // (env-tunable) to prevent BlockVision Sui RPC 429 cascades. Admit
  // AFTER cheap rejections (auth/rate-limit/reserved/user-lookup) so we
  // don't burn counter slots on requests that would have been rejected
  // anyway. Always release in `finally`.
  const admission = await tryAdmitMint();
  if (!admission.admitted) {
    console.warn(
      `[reserve] admission rejected — in-flight=${admission.inFlight}, retry-after=${admission.retryAfterSec}s`
    );
    return admissionRejectedResponse(
      admission.retryAfterSec ?? 5
    ) as NextResponse;
  }

  try {
    return await reserveAfterAdmission({
      handle,
      label,
      callerAddress,
      keypair,
      suiRpcUrl,
      callerUserId: callerUser.id,
    });
  } finally {
    await admission.release();
  }
}

async function reserveAfterAdmission({
  handle,
  label,
  callerAddress,
  keypair,
  suiRpcUrl,
  callerUserId,
}: {
  handle: string;
  label: string;
  callerAddress: string;
  keypair: Ed25519Keypair;
  suiRpcUrl: string;
  callerUserId: string;
}): Promise<NextResponse> {
  let onChainAddress: string | null;
  try {
    // [S18-F15] Always-live RPC at mint time (NOT the cached resolver).
    // A stale-negative cache entry would wrongly admit the mint → on-chain
    // createLeafSubName reverts because the leaf already exists → user
    // sees confusing 502 instead of clean 409 "taken." The cache stays
    // in /api/identity/check (picker debounce burst absorption).
    onChainAddress = await withSuiRetry(
      () => resolveSuinsViaRpc(handle, { suiRpcUrl }),
      { label: "reserve:premint-check" }
    );
  } catch (err) {
    const detail =
      err instanceof SuinsRpcError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown SuiNS RPC error";
    console.error("[reserve] SuiNS pre-mint check failed:", detail);
    return errorResponse(
      `SuiNS verification temporarily unavailable: ${detail}. Please retry shortly.`,
      503
    );
  }
  if (onChainAddress !== null) {
    // [S18-F15] Self-heal the picker cache.
    await invalidateAndWarmSuins(handle, onChainAddress);
    return errorResponse("Username already claimed on-chain", 409, "taken");
  }

  const existingByUsername = await prisma.user.findUnique({
    where: { username: label },
    select: { id: true },
  });
  if (existingByUsername) {
    return errorResponse("Username already claimed", 409, "taken");
  }

  const suiClient = createSuiRpcClient();
  const suinsClient = new SuinsClient({
    client: suiClient,
    network: SUI_NETWORK,
  });

  let txDigest: string;
  try {
    // [S18-F16] Rebuild tx INSIDE the retry closure. Sui SDK's Transaction
    // class caches built bytes after the first signAndExecute call, so
    // retries would replay the stale-version shared-object reference and
    // fail identically. Rebuilding from scratch forces fresh shared-object
    // resolution against the current RPC view.
    const result = await withSuiRetry(
      () => {
        const freshTx = buildAddLeafTx(suinsClient, {
          label,
          targetAddress: callerAddress,
        });
        return suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: freshTx,
          options: { showEffects: true },
        });
      },
      { label: "reserve:mint" }
    );
    if (result.effects?.status?.status !== "success") {
      throw new Error(
        `Mint tx reverted on-chain: ${result.effects?.status?.error ?? "unknown reason"}`
      );
    }
    txDigest = result.digest;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Mint execution failed";
    console.error("[reserve] signAndExecuteTransaction failed:", message);
    return errorResponse(`Failed to mint leaf: ${message}`, 502);
  }

  const claimedAt = new Date();
  try {
    await prisma.user.update({
      where: { id: callerUserId },
      data: {
        username: label,
        usernameClaimedAt: claimedAt,
        usernameMintTxDigest: txDigest,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      console.warn(
        `[reserve] Race lost on DB unique for "${label}" after on-chain mint ${txDigest}. Revoking leaf.`
      );
      try {
        // [S18-F16] Same rebuild-inside-closure pattern. The revoke MUST
        // land — if it fails the user is in an orphan state.
        await withSuiRetry(
          () => {
            const freshRevokeTx = buildRevokeLeafTx(suinsClient, { label });
            return suiClient.signAndExecuteTransaction({
              signer: keypair,
              transaction: freshRevokeTx,
              options: { showEffects: false },
            });
          },
          { label: "reserve:revoke" }
        );
      } catch (revokeErr) {
        console.error(
          `[reserve] ORPHAN: leaf ${handle} → ${callerAddress} minted at ${txDigest} but DB write lost race AND revoke failed:`,
          revokeErr instanceof Error ? revokeErr.message : revokeErr
        );
      }
      return errorResponse(
        "Username was claimed by another user moments ago",
        409,
        "taken"
      );
    }
    console.error(
      `[reserve] ORPHAN: leaf ${handle} → ${callerAddress} minted at ${txDigest} but DB write failed:`,
      err instanceof Error ? err.message : err
    );
    return errorResponse(
      `Username minted on-chain but database write failed. Contact support with this code: ${txDigest.slice(0, 12)}`,
      500
    );
  }

  // [S18-F13] Write-through cache update so the freshly-claimed handle
  // is visible to subsequent picker checks IMMEDIATELY, not after the
  // negative TTL expires.
  await invalidateAndWarmSuins(handle, callerAddress);

  return NextResponse.json({
    success: true,
    label,
    fullHandle: handle,
    txDigest,
    walletAddress: callerAddress,
  } satisfies ReserveSuccessBody);
}
