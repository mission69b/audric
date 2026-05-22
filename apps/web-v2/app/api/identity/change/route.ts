import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { SuinsClient, SuinsTransaction } from "@mysten/suins";
import { resolveSuinsViaRpc, SuinsRpcError } from "@t2000/engine";
import {
  AUDRIC_PARENT_NAME,
  AUDRIC_PARENT_NFT_ID,
  fullHandle,
} from "@t2000/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { assertOwns, authenticateRequest } from "@/lib/audric-auth";
import { env } from "@/lib/env";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";
import { Prisma, prisma } from "@/lib/prisma";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withSuiRetry } from "@/lib/sui-retry";
import { getSuiRpcUrl } from "@/lib/sui-rpc";
import {
  invalidateAndWarmSuins,
  invalidateRevokedSuins,
} from "@/lib/suins-cache";

/**
 * POST /api/identity/change   (S.84 — Audric Passport identity surfacing)
 *
 * Atomically swap a user's Audric handle: revoke their current
 * `<old>.audric.sui` leaf and create a fresh `<new>.audric.sui` leaf
 * pointing to the SAME wallet — both Move calls inside ONE PTB so the
 * on-chain state can never end up in a half-changed limbo.
 *
 * ## Why atomic single-PTB
 *
 * Sequential designs both have an awkward failure mode:
 *   - mint-then-revoke: if the second tx fails the user has TWO leaves.
 *   - revoke-then-mint: if the second tx fails the user has NO leaf.
 *
 * One PTB with `removeLeafSubName(old)` + `createLeafSubName(new)` lets
 * Sui's transaction atomicity carry the whole-or-nothing invariant. The
 * signer (the parent NFT custody key) is the same address for both calls
 * so single-signer atomicity holds.
 *
 * [v0.7e Phase 2 / S.253 — 2026-05-22] Verbatim port from
 * apps/web/app/api/identity/change/route.ts. Changes vs source:
 *   - `@/lib/auth` → `@/lib/audric-auth`.
 *   - `Prisma` imported from `@/lib/prisma` (re-export).
 *   - `runtime` segment export dropped.
 *   - ESLint disable comments removed (web-v2 uses biome, which doesn't
 *     ship the no-restricted-syntax CANONICAL-BYPASS rule from apps/web).
 *     The CANONICAL-BYPASS rationale still holds — this is a
 *     parent-NFT-signed leaf-mutation PTB, not a user-signed sponsored
 *     write — but the lint guard doesn't follow into web-v2.
 */

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK as "mainnet" | "testnet";

type ChangeReason =
  | "invalid"
  | "too-short"
  | "too-long"
  | "reserved"
  | "taken"
  | "unchanged";

interface ChangeSuccessBody {
  fullHandle: string;
  newLabel: string;
  oldLabel: string;
  success: true;
  txDigest: string;
  walletAddress: string;
}

interface ChangeErrorBody {
  error: string;
  reason?: ChangeReason;
}

function errorResponse(
  error: string,
  status: number,
  reason?: ChangeReason
): NextResponse {
  const body: ChangeErrorBody = reason ? { error, reason } : { error };
  return NextResponse.json(body, { status });
}

function loadCustodyKeypair(): Ed25519Keypair | null {
  const rawKey = env.AUDRIC_PARENT_NFT_PRIVATE_KEY;
  if (!rawKey) {
    return null;
  }
  try {
    const { scheme, secretKey } = decodeSuiPrivateKey(rawKey);
    if (scheme !== "ED25519") {
      console.error(
        `[change] Expected ED25519 keypair, got scheme "${scheme}"`
      );
      return null;
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch (err) {
    console.error(
      "[change] Failed to decode AUDRIC_PARENT_NFT_PRIVATE_KEY:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Build the atomic change PTB: revoke OLD + create NEW in one tx. The
 * order doesn't matter for atomicity (Sui rolls the whole tx back if
 * any call aborts) but we revoke BEFORE create so the namespace slot is
 * freed in case `createLeafSubName` has any internal "already exists"
 * check that fires before the Move-VM level check. Defensive ordering.
 */
function buildAtomicChangeTx(
  suinsClient: SuinsClient,
  {
    oldLabel,
    newLabel,
    targetAddress,
  }: { oldLabel: string; newLabel: string; targetAddress: string }
): Transaction {
  const tx = new Transaction();
  const suinsTx = new SuinsTransaction(suinsClient, tx);
  suinsTx.removeLeafSubName({
    parentNft: AUDRIC_PARENT_NFT_ID,
    name: `${oldLabel}.${AUDRIC_PARENT_NAME}`,
  });
  suinsTx.createLeafSubName({
    parentNft: AUDRIC_PARENT_NFT_ID,
    name: `${newLabel}.${AUDRIC_PARENT_NAME}`,
    targetAddress: normalizeSuiAddress(targetAddress),
  });
  return tx;
}

function buildRollbackTx(
  suinsClient: SuinsClient,
  {
    oldLabel,
    newLabel,
    targetAddress,
  }: { oldLabel: string; newLabel: string; targetAddress: string }
): Transaction {
  const tx = new Transaction();
  const suinsTx = new SuinsTransaction(suinsClient, tx);
  suinsTx.removeLeafSubName({
    parentNft: AUDRIC_PARENT_NFT_ID,
    name: `${newLabel}.${AUDRIC_PARENT_NAME}`,
  });
  suinsTx.createLeafSubName({
    parentNft: AUDRIC_PARENT_NFT_ID,
    name: `${oldLabel}.${AUDRIC_PARENT_NAME}`,
    targetAddress: normalizeSuiAddress(targetAddress),
  });
  return tx;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // [SPEC 30 Phase 1A.3] Bind body.address to verified JWT identity to
  // prevent attacker-revokes-victim-leaf griefing.
  const auth = await authenticateRequest(req);
  if ("error" in auth) {
    return auth.error;
  }

  let body: { newLabel?: unknown; address?: unknown };
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

  const validation = validateAudricLabel(body.newLabel);
  if (!validation.valid) {
    return errorResponse(
      `Invalid username: ${validation.reason}`,
      400,
      validation.reason
    );
  }
  const newLabel = validation.label;

  const rl = rateLimit(
    `identity-change:${callerAddress}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
  );
  if (!rl.success) {
    return rateLimitResponse(
      rl.retryAfterMs ?? RATE_LIMIT_WINDOW_MS
    ) as NextResponse;
  }

  if (isReserved(newLabel)) {
    return errorResponse("Username is reserved", 400, "reserved");
  }

  const callerUser = await prisma.user.findUnique({
    where: { suiAddress: callerAddress },
    select: { id: true, username: true },
  });
  if (!callerUser) {
    return errorResponse("User not found — complete signup first", 404);
  }
  if (!callerUser.username) {
    return errorResponse(
      "You have not claimed a username yet. Use the claim flow first.",
      400
    );
  }
  const oldLabel = callerUser.username;

  if (oldLabel === newLabel) {
    return errorResponse(
      "New username matches current username",
      400,
      "unchanged"
    );
  }

  const keypair = loadCustodyKeypair();
  if (!keypair) {
    return errorResponse(
      "Username minting temporarily unavailable. Please try again shortly.",
      503
    );
  }

  const handle = fullHandle(newLabel);
  const suiRpcUrl = getSuiRpcUrl();

  let onChainAddress: string | null;
  try {
    // [S18-F15] Always-live RPC at change-time (NOT cached). The cache
    // belongs in /api/identity/check (picker debounce burst absorption);
    // the gate at change-time MUST be ground-truth.
    onChainAddress = await resolveSuinsViaRpc(handle, { suiRpcUrl });
  } catch (err) {
    const detail =
      err instanceof SuinsRpcError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown SuiNS RPC error";
    console.error("[change] SuiNS pre-check failed:", detail);
    return errorResponse(
      `SuiNS verification temporarily unavailable: ${detail}. Please retry shortly.`,
      503
    );
  }
  if (onChainAddress !== null) {
    await invalidateAndWarmSuins(handle, onChainAddress);
    return errorResponse("Username already claimed on-chain", 409, "taken");
  }

  const existingByUsername = await prisma.user.findUnique({
    where: { username: newLabel },
    select: { id: true },
  });
  if (existingByUsername) {
    return errorResponse("Username already claimed", 409, "taken");
  }

  const suiClient = new SuiJsonRpcClient({
    url: suiRpcUrl,
    network: SUI_NETWORK,
  });
  const suinsClient = new SuinsClient({
    client: suiClient,
    network: SUI_NETWORK,
  });

  let txDigest: string;
  try {
    // [S18-F16] Rebuild tx INSIDE the retry closure. See reserve route's
    // S18-F16 comment for the SDK-caching rationale.
    const result = await withSuiRetry(
      () => {
        const freshTx = buildAtomicChangeTx(suinsClient, {
          oldLabel,
          newLabel,
          targetAddress: callerAddress,
        });
        return suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: freshTx,
          options: { showEffects: true },
        });
      },
      { label: "change:atomic" }
    );
    if (result.effects?.status?.status !== "success") {
      throw new Error(
        `Change tx reverted on-chain: ${result.effects?.status?.error ?? "unknown reason"}`
      );
    }
    txDigest = result.digest;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Change execution failed";
    console.error("[change] signAndExecuteTransaction failed:", message);
    return errorResponse(`Failed to change handle: ${message}`, 502);
  }

  const changedAt = new Date();
  try {
    await prisma.user.update({
      where: { id: callerUser.id },
      data: {
        username: newLabel,
        usernameLastChangedAt: changedAt,
        usernameMintTxDigest: txDigest,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      console.warn(
        `[change] Race lost on DB unique for "${newLabel}" after on-chain change ${txDigest}. Rolling back leaf.`
      );
      try {
        await withSuiRetry(
          () => {
            const freshRollbackTx = buildRollbackTx(suinsClient, {
              oldLabel,
              newLabel,
              targetAddress: callerAddress,
            });
            return suiClient.signAndExecuteTransaction({
              signer: keypair,
              transaction: freshRollbackTx,
              options: { showEffects: false },
            });
          },
          { label: "change:rollback" }
        );
      } catch (rollbackErr) {
        console.error(
          `[change] ORPHAN: change ${oldLabel} → ${newLabel} (${callerAddress}) landed at ${txDigest} but DB lost race AND rollback failed:`,
          rollbackErr instanceof Error ? rollbackErr.message : rollbackErr
        );
      }
      return errorResponse(
        "Username was claimed by another user moments ago",
        409,
        "taken"
      );
    }
    console.error(
      `[change] ORPHAN: change ${oldLabel} → ${newLabel} (${callerAddress}) landed at ${txDigest} but DB write failed:`,
      err instanceof Error ? err.message : err
    );
    return errorResponse(
      `Handle changed on-chain but database write failed. Contact support with this code: ${txDigest.slice(0, 12)}`,
      500
    );
  }

  // [S18-F13] Write-through both cache entries.
  const oldHandle = fullHandle(oldLabel);
  await Promise.all([
    invalidateAndWarmSuins(handle, callerAddress),
    invalidateRevokedSuins(oldHandle),
  ]);

  return NextResponse.json({
    success: true,
    oldLabel,
    newLabel,
    fullHandle: handle,
    txDigest,
    walletAddress: callerAddress,
  } satisfies ChangeSuccessBody);
}
