import { NextRequest, NextResponse } from 'next/server';
import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { SuinsClient, SuinsTransaction } from '@mysten/suins';
import { AUDRIC_PARENT_NAME, AUDRIC_PARENT_NFT_ID, fullHandle } from '@t2000/sdk';
import { SuinsRpcError, resolveSuinsViaRpc } from '@t2000/engine';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getSuiRpcUrl } from '@/lib/sui-rpc';
import {
  invalidateAndWarmSuins,
  invalidateRevokedSuins,
} from '@/lib/suins-cache';
import { withSuiRetry } from '@/lib/sui-retry';
import { isReserved } from '@/lib/identity/reserved-usernames';
import { validateAudricLabel } from '@/lib/identity/validate-label';
import { authenticateRequest, assertOwns } from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * POST /api/identity/change   (S.84 — Audric Passport identity surfacing)
 *
 * Atomically swap a user's Audric handle: revoke their current
 * `<old>.audric.sui` leaf and create a fresh `<new>.audric.sui` leaf
 * pointing to the SAME wallet — both Move calls inside ONE PTB so the
 * on-chain state can never end up in a half-changed limbo.
 *
 * Request body:
 *   { newLabel: string, address: string }
 *
 * Success response:
 *   200 { success: true, oldLabel, newLabel, fullHandle, txDigest, walletAddress }
 *
 * Error responses (mirror /api/identity/reserve for client reuse of
 * the typed `reason` switch):
 *   400 { error, reason? }   bad input / reserved / unchanged / pre-claim user
 *   401 { error }            missing or invalid JWT
 *   404 { error }            caller's User row not found
 *   409 { error, reason }    new label taken on-chain or in DB after pre-check
 *   429 { error }            rate limit exceeded (3 changes / 24h)
 *   500 { error }            ORPHAN logged — atomic PTB landed but DB write
 *                            failed for a non-race reason; caller gets the
 *                            digest prefix as a support code
 *   502 { error }            atomic PTB reverted on-chain (e.g. SuiNS
 *                            insufficient gas, or the new leaf already
 *                            exists despite the pre-check — race with
 *                            another `change`)
 *   503 { error }            custody key unconfigured / SuiNS RPC degraded
 *
 * ## Why atomic single-PTB (vs sequential mint→revoke or revoke→mint)
 *
 * Sequential designs all have an awkward failure mode:
 *
 *   - mint-then-revoke: if the second tx fails the user has TWO leaves
 *     pointing to their wallet (DB tracks new, old is orphaned on-chain).
 *   - revoke-then-mint: if the second tx fails the user has NO leaf and
 *     loses identity entirely; sniping race opens for both old and new.
 *
 * One PTB with `createLeafSubName(new)` + `removeLeafSubName(old)` lets
 * Sui's transaction atomicity carry the whole-or-nothing invariant for
 * us. The signer (the parent NFT custody key) is the same address for
 * both calls so single-signer atomicity holds.
 *
 * The SDK's `buildAddLeafTx` / `buildRevokeLeafTx` each construct their
 * own `Transaction` so they can't be merged at the SDK layer. We compose
 * directly here using `SuinsTransaction.{createLeafSubName,removeLeafSubName}`
 * on a single shared `Transaction` instance — same Move calls the SDK
 * helpers emit, just inlined to share the PTB. The duplication is small
 * (~10 LOC) and keeps the change in one repo.
 *
 * If we ever add a third leaf-mutation route, promote this composition
 * into an SDK helper (`buildChangeLeafTx`) and bump @t2000/sdk together
 * with audric in a coordinated release.
 *
 * ## Auth + rate limit
 *
 * Same model as `/api/identity/reserve` — `x-zklogin-jwt` header is the
 * presence gate, the `address` body field binds the request to a User
 * row by `suiAddress`. Rate limit is tighter (3 / 24h vs reserve's 5 /
 * 24h) because handle churn is a higher-trust signal of abuse and the
 * legitimate change-frequency is "occasional".
 *
 * No cooldown between changes for v0.1 — explicit founder decision to
 * favour reversibility over abuse-prevention until we see real usage.
 * If griefing emerges (e.g. handle-cycling to dodge accountability)
 * add a 7-day soft cooldown enforced via `usernameLastChangedAt`.
 *
 * ## Race semantics
 *
 * 1. Length / charset / hyphen rules — pure
 * 2. Reserved-name list — in-memory Set
 * 3. NEW != OLD check — caller must actually be changing
 * 4. SuiNS RPC pre-check on NEW — fails 409 if leaf already exists
 * 5. DB pre-check on NEW — fails 409 if another User has it
 * 6. Atomic PTB: createLeafSubName(NEW) + removeLeafSubName(OLD) — Sui
 *    rejects the whole PTB if either Move call would fail (e.g. NEW
 *    raced into existence between step 4 and step 6, or OLD was
 *    revoked by an admin recovery in the same window)
 * 7. DB update under transaction. P2002 on `username` unique = the
 *    same NEW label was DB-claimed between step 5 and step 7 → emit
 *    a "rollback" PTB (recreate OLD + revoke NEW) and return 409.
 *    Other DB failures = leaf orphan; log + 500 with digest prefix.
 */

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;

type ChangeReason = 'invalid' | 'too-short' | 'too-long' | 'reserved' | 'taken' | 'unchanged';

interface ChangeSuccessBody {
  success: true;
  oldLabel: string;
  newLabel: string;
  fullHandle: string;
  txDigest: string;
  walletAddress: string;
}

interface ChangeErrorBody {
  error: string;
  reason?: ChangeReason;
}

function errorResponse(error: string, status: number, reason?: ChangeReason): NextResponse {
  const body: ChangeErrorBody = reason ? { error, reason } : { error };
  return NextResponse.json(body, { status });
}

function loadCustodyKeypair(): Ed25519Keypair | null {
  const rawKey = env.AUDRIC_PARENT_NFT_PRIVATE_KEY;
  if (!rawKey) return null;
  try {
    const { scheme, secretKey } = decodeSuiPrivateKey(rawKey);
    if (scheme !== 'ED25519') {
      console.error(`[change] Expected ED25519 keypair, got scheme "${scheme}"`);
      return null;
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch (err) {
    console.error(
      '[change] Failed to decode AUDRIC_PARENT_NFT_PRIVATE_KEY:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Build the atomic change PTB: revoke OLD + create NEW in one tx.
 *
 * The order of Move calls inside the PTB doesn't matter for atomicity
 * (Sui rolls the whole tx back if any call aborts), but we revoke
 * BEFORE create so the namespace slot is freed in case `createLeafSubName`
 * has any internal "already exists" check that fires before the Move-VM
 * level check. Defensive ordering — costs nothing.
 */
function buildAtomicChangeTx(
  suinsClient: SuinsClient,
  { oldLabel, newLabel, targetAddress }: { oldLabel: string; newLabel: string; targetAddress: string },
): Transaction {
  // eslint-disable-next-line no-restricted-syntax -- CANONICAL-BYPASS: SPEC 10 leaf-mint route (S.84 change-handle). Signed by parent NFT custody key, not user — documented exception in audric-canonical-write.mdc.
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

/**
 * Inverse of `buildAtomicChangeTx`. Used after a P2002 race where the
 * atomic change PTB landed on-chain but the DB write lost. Recreates
 * OLD + revokes NEW so the on-chain state matches the DB (which still
 * has the user's pre-change username).
 */
function buildRollbackTx(
  suinsClient: SuinsClient,
  { oldLabel, newLabel, targetAddress }: { oldLabel: string; newLabel: string; targetAddress: string },
): Transaction {
  // eslint-disable-next-line no-restricted-syntax -- CANONICAL-BYPASS: SPEC 10 leaf-mint route (S.84 change-handle rollback). Signed by parent NFT custody key, not user — documented exception in audric-canonical-write.mdc.
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
  // [SPEC 30 Phase 1A.3] Pre-Phase-1A this route trusted the body.address
  // field after only structurally decoding the JWT. The reporter's PoC
  // could swap `address` to a victim's wallet and cause Audric to revoke
  // the victim's existing leaf + mint a new attacker-controlled label
  // pointing to the same wallet — griefing the victim's handle and
  // burning Audric's gas pre-fund. Bind body.address to the verified
  // JWT identity.
  const auth = await authenticateRequest(req);
  if ('error' in auth) return auth.error;

  let body: { newLabel?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (typeof body.address !== 'string' || !isValidSuiAddress(body.address)) {
    return errorResponse('Invalid address', 400);
  }
  const callerAddress = normalizeSuiAddress(body.address);

  const ownership = assertOwns(auth.verified, callerAddress);
  if (ownership) return ownership;

  const validation = validateAudricLabel(body.newLabel);
  if (!validation.valid) {
    return errorResponse(`Invalid username: ${validation.reason}`, 400, validation.reason);
  }
  const newLabel = validation.label;

  const rl = rateLimit(`identity-change:${callerAddress}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs ?? RATE_LIMIT_WINDOW_MS) as NextResponse;

  if (isReserved(newLabel)) {
    return errorResponse('Username is reserved', 400, 'reserved');
  }

  const callerUser = await prisma.user.findUnique({
    where: { suiAddress: callerAddress },
    select: { id: true, username: true },
  });
  if (!callerUser) {
    return errorResponse('User not found — complete signup first', 404);
  }
  if (!callerUser.username) {
    return errorResponse(
      'You have not claimed a username yet. Use the claim flow first.',
      400,
    );
  }
  const oldLabel = callerUser.username;

  if (oldLabel === newLabel) {
    return errorResponse('New username matches current username', 400, 'unchanged');
  }

  const keypair = loadCustodyKeypair();
  if (!keypair) {
    return errorResponse(
      'Username minting temporarily unavailable. Please try again shortly.',
      503,
    );
  }

  const handle = fullHandle(newLabel);
  const suiRpcUrl = getSuiRpcUrl();

  let onChainAddress: string | null;
  try {
    // [S18-F15 — May 2026] Always-live RPC at mint time (NOT cached).
    // See reserve/route.ts S18-F15 comment for rationale: the cache
    // belongs in /api/identity/check (picker debounce burst absorption);
    // the gate at change-time MUST be ground-truth so a stale-negative
    // cache entry can't drive an on-chain createLeafSubName revert.
    // Cost of one BlockVision RPC per change attempt is trivial — change
    // is rate-limited to 3/24h per address and gated by admission control.
    onChainAddress = await resolveSuinsViaRpc(handle, { suiRpcUrl });
  } catch (err) {
    const detail =
      err instanceof SuinsRpcError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unknown SuiNS RPC error';
    console.error('[change] SuiNS pre-check failed:', detail);
    return errorResponse(
      `SuiNS verification temporarily unavailable: ${detail}. Please retry shortly.`,
      503,
    );
  }
  if (onChainAddress !== null) {
    // [S18-F15] Self-heal picker cache (see reserve/route.ts comment).
    await invalidateAndWarmSuins(handle, onChainAddress);
    return errorResponse('Username already claimed on-chain', 409, 'taken');
  }

  const existingByUsername = await prisma.user.findUnique({
    where: { username: newLabel },
    select: { id: true },
  });
  if (existingByUsername) {
    return errorResponse('Username already claimed', 409, 'taken');
  }

  const suiClient = new SuiJsonRpcClient({ url: suiRpcUrl, network: SUI_NETWORK });
  const suinsClient = new SuinsClient({ client: suiClient, network: SUI_NETWORK });

  let txDigest: string;
  try {
    // [S18-F16 — May 2026] Wrap in withSuiRetry AND rebuild tx inside the
    // retry closure. Same dual-fix as reserve route: (a) absorb transient
    // 429s + shared-object stale-version contention; (b) force a fresh
    // build on each retry because the Sui SDK caches built bytes after
    // the first signAndExecute call. Pre-fix: change route had NO retry
    // wrapping at all (just one signAndExecute call), so any transient
    // SuiNS / Sui RPC blip wedged the user's handle change with a 502.
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
      { label: 'change:atomic' },
    );
    if (result.effects?.status?.status !== 'success') {
      throw new Error(
        `Change tx reverted on-chain: ${result.effects?.status?.error ?? 'unknown reason'}`,
      );
    }
    txDigest = result.digest;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Change execution failed';
    console.error('[change] signAndExecuteTransaction failed:', message);
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
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      console.warn(
        `[change] Race lost on DB unique for "${newLabel}" after on-chain change ${txDigest}. Rolling back leaf.`,
      );
      try {
        // [S18-F16] Same withSuiRetry + rebuild-inside-closure pattern.
        // The rollback PTB MUST land — if it fails the user is in an
        // orphan state where DB has old handle but chain has new handle.
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
          { label: 'change:rollback' },
        );
      } catch (rollbackErr) {
        console.error(
          `[change] ORPHAN: change ${oldLabel} → ${newLabel} (${callerAddress}) landed at ${txDigest} but DB lost race AND rollback failed:`,
          rollbackErr instanceof Error ? rollbackErr.message : rollbackErr,
        );
      }
      return errorResponse('Username was claimed by another user moments ago', 409, 'taken');
    }
    console.error(
      `[change] ORPHAN: change ${oldLabel} → ${newLabel} (${callerAddress}) landed at ${txDigest} but DB write failed:`,
      err instanceof Error ? err.message : err,
    );
    return errorResponse(
      'Handle changed on-chain but database write failed. Contact support with this code: ' +
        txDigest.slice(0, 12),
      500,
    );
  }

  // [S18-F13 — May 2026] Write-through both cache entries. The atomic
  // PTB simultaneously created NEW + revoked OLD, so:
  //   - newLabel.audric.sui is now claimed → cache as positive entry
  //   - oldLabel.audric.sui is now unclaimed → cache as fresh negative
  //     (otherwise the previous positive entry would linger 5 min)
  // Both calls are best-effort; failures degrade to cache-miss on next
  // read, not user-facing breakage.
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
