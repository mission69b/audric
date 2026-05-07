import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { SuinsClient } from '@mysten/suins';
import { buildAddLeafTx, buildRevokeLeafTx, fullHandle } from '@t2000/sdk';
import { SuinsRpcError } from '@t2000/engine';
import { resolveSuinsCached, invalidateAndWarmSuins } from '@/lib/suins-cache';
import { tryAdmitMint, admissionRejectedResponse } from '@/lib/identity/admission-control';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getSuiRpcUrl } from '@/lib/sui-rpc';
import { withSuiRetry } from '@/lib/sui-retry';
import { isReserved } from '@/lib/identity/reserved-usernames';
import { validateAudricLabel } from '@/lib/identity/validate-label';
import { validateJwt } from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * POST /api/identity/reserve
 *
 * Mints a `<label>.audric.sui` leaf subname pointing to the caller's wallet
 * and writes the resulting `username` to their `User` row. This is the
 * one-shot claim flow that turns a fresh signup into an Audric Passport
 * with a stable identity handle (per SPEC 10 v0.2.1 Phase B.2).
 *
 * Request body:
 *   { label: string, address: string }
 *
 * Success response:
 *   200 { success: true, label, fullHandle, txDigest, walletAddress }
 *
 * Error responses:
 *   400 { error, reason? }   — bad input / validation failure / DB collision
 *   401 { error }            — missing or invalid JWT
 *   404 { error }            — caller's User row not found (signup incomplete)
 *   409 { error, reason }    — name taken between check and reserve (race)
 *   429 { error }            — rate limit exceeded
 *   500 { error }            — unexpected internal error
 *   503 { error }            — service degraded (key unconfigured, SuiNS down)
 *
 * ## Signing model (CANONICAL-BYPASS of composeTx)
 *
 * Per `audric-canonical-write.mdc:99` + SPEC 10 Phase A "service-account-signed"
 * callout: this route is NOT a Enoki-sponsored user-signed write. The signer
 * is the parent NFT custody address (`0xaca29165…23d11`, per RUNBOOK §1).
 *
 * Bundle A locked 2026-05-05 (founder decision): the custody Ed25519 keypair
 * is loaded from `env.AUDRIC_PARENT_NFT_PRIVATE_KEY` (Bech32 `suiprivkey1…`)
 * and signs the leaf-mint PTB server-side. The custody address is pre-funded
 * with SUI for gas (~50 SUI initial pre-fund covers ~15k mints at observed
 * 0.0032 SUI/mint per RUNBOOK §4; refill annually). NO Enoki involvement
 * for this surface — Enoki sponsors user-signed writes only.
 *
 * ## Anti-race funnel (mirrors `/api/identity/check` for ground truth)
 *
 * The race window between `/api/identity/check` (read-only) and this route
 * (write) is 1–10 seconds (typing → click reserve). Two concurrent users
 * could pass `/check` simultaneously for the same label and reach `/reserve`
 * with both checks reporting "available". The funnel below catches every
 * realistic race:
 *
 *   1. Length / charset / hyphen rules (cheap; pure)
 *   2. Reserved-name list (cheap; in-memory Set)
 *   3. SuiNS RPC ground truth (BEFORE the on-chain write — fail-CLOSED)
 *   4. Postgres `User.username` unique check (BEFORE the on-chain write)
 *   5. On-chain mint (parent-permissioned, single signer = our key, atomic)
 *   6. Postgres write under transaction. If P2002 fires (someone else won
 *      the race AFTER step 4 but BEFORE our DB write), we revoke the leaf
 *      and return 409. This loop is bounded — only one of two racers can
 *      win the DB unique constraint, the other is rolled back.
 *
 * Steps 5+6 form an atomic-ish boundary. If the on-chain mint succeeds but
 * the DB write fails for any reason OTHER than P2002 (e.g. Postgres outage),
 * the leaf becomes ORPHANED on-chain — leaf points to user's wallet but no
 * `User.username` row. Operator recovery via the future
 * `/api/admin/identity/release` (A.5) endpoint, which revokes the leaf so
 * the user can retry. Logged via console.error("[reserve] orphan").
 *
 * ## Auth
 *
 * Requires a valid `x-zklogin-jwt` header (decoded structurally; signature
 * verification deferred per existing audric pattern in `lib/auth.ts`). The
 * `address` in the request body MUST resolve to an existing User row by
 * `suiAddress` — this prevents the route from minting leaves for addresses
 * that haven't completed Audric signup. The JWT presence is the auth
 * gate; the address lookup is the resource binding.
 *
 * Rate limiting: 5 reserve attempts per address per 24h. The DB unique
 * constraint on `User.username` already enforces "one claim per user" as
 * a structural invariant, so the rate limit is purely abuse-prevention
 * (e.g. an attacker scripting check→reserve with random labels to burn
 * Audric's gas pre-fund).
 */

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;

type ReserveReason =
  | 'invalid'
  | 'too-short'
  | 'too-long'
  | 'reserved'
  | 'taken';

interface ReserveSuccessBody {
  success: true;
  label: string;
  fullHandle: string;
  txDigest: string;
  walletAddress: string;
}

interface ReserveErrorBody {
  error: string;
  reason?: ReserveReason;
}

function errorResponse(error: string, status: number, reason?: ReserveReason): NextResponse {
  const body: ReserveErrorBody = reason ? { error, reason } : { error };
  return NextResponse.json(body, { status });
}

/**
 * Lazy custody-keypair loader. Pulled out of module-load so missing-env
 * doesn't crash route imports — instead the route returns 503 at request
 * time, matching the "feature degrades, app boots" pattern documented in
 * `lib/env.ts` for optional vars.
 */
function loadCustodyKeypair(): Ed25519Keypair | null {
  const rawKey = env.AUDRIC_PARENT_NFT_PRIVATE_KEY;
  if (!rawKey) return null;
  try {
    const { scheme, secretKey } = decodeSuiPrivateKey(rawKey);
    if (scheme !== 'ED25519') {
      console.error(`[reserve] Expected ED25519 keypair, got scheme "${scheme}"`);
      return null;
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch (err) {
    console.error(
      '[reserve] Failed to decode AUDRIC_PARENT_NFT_PRIVATE_KEY:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const jwt = req.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: { label?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (typeof body.address !== 'string' || !isValidSuiAddress(body.address)) {
    return errorResponse('Invalid address', 400);
  }
  const callerAddress = normalizeSuiAddress(body.address);

  const validation = validateAudricLabel(body.label);
  if (!validation.valid) {
    return errorResponse(`Invalid username: ${validation.reason}`, 400, validation.reason);
  }
  const label = validation.label;

  const rl = rateLimit(`identity-reserve:${callerAddress}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs ?? RATE_LIMIT_WINDOW_MS) as NextResponse;

  if (isReserved(label)) {
    return errorResponse('Username is reserved', 400, 'reserved');
  }

  const callerUser = await prisma.user.findUnique({
    where: { suiAddress: callerAddress },
    select: { id: true, username: true },
  });
  if (!callerUser) {
    return errorResponse('User not found — complete signup first', 404);
  }
  if (callerUser.username) {
    return errorResponse(
      'You already have a username. Use the change-username flow to update it.',
      400,
    );
  }

  const keypair = loadCustodyKeypair();
  if (!keypair) {
    return errorResponse(
      'Username minting temporarily unavailable. Please try again shortly.',
      503,
    );
  }

  const handle = fullHandle(label);
  const suiRpcUrl = getSuiRpcUrl();

  // [S18-F14 — May 2026] Admission control. Cap concurrent in-flight mints
  // at 5 (env-tunable) to prevent BlockVision Sui RPC 429 cascades observed
  // in the May 7 mainnet load test (25 concurrent → 4% success). Admit AFTER
  // cheap rejections (auth/rate-limit/reserved/user-lookup) so we don't burn
  // counter slots on requests that would have been rejected anyway. Always
  // release in `finally` so abandoned slots can't leak.
  const admission = await tryAdmitMint();
  if (!admission.admitted) {
    console.warn(
      `[reserve] admission rejected — in-flight=${admission.inFlight}, retry-after=${admission.retryAfterSec}s`,
    );
    return admissionRejectedResponse(admission.retryAfterSec ?? 5) as NextResponse;
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

/**
 * The mint pipeline once a request has cleared admission control. Extracted
 * so the parent POST handler's `finally` can guarantee `admission.release()`
 * fires on EVERY exit path (success, error, throw) without threading the
 * release call through every early-return branch.
 */
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
    // [S18-F6 / vercel-logs L4] Wrap in withSuiRetry to absorb sub-second
    // SuiNS rate-limit blips. Pre-fix: 18 production failures / 12h from a
    // single 429 → user got 503 + had to manually retry.
    //
    // [S18-F9 / vercel-logs L8] Use the cached resolver — pre-mint check
    // for a never-claimed handle returns null (negative cache: 30s), and a
    // claimed handle's address (positive cache: 5min). Cache hits skip the
    // RPC call entirely. The cache is also shared with the public profile
    // page lookup, so a `/<username>` page render warm-up halves the RPC
    // cost of any subsequent `/api/identity/check` + `/api/identity/reserve`
    // for the same handle.
    onChainAddress = await withSuiRetry(
      () => resolveSuinsCached(handle, { suiRpcUrl }),
      { label: 'reserve:premint-check' },
    );
  } catch (err) {
    const detail =
      err instanceof SuinsRpcError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unknown SuiNS RPC error';
    console.error('[reserve] SuiNS pre-mint check failed:', detail);
    return errorResponse(
      `SuiNS verification temporarily unavailable: ${detail}. Please retry shortly.`,
      503,
    );
  }
  if (onChainAddress !== null) {
    return errorResponse('Username already claimed on-chain', 409, 'taken');
  }

  const existingByUsername = await prisma.user.findUnique({
    where: { username: label },
    select: { id: true },
  });
  if (existingByUsername) {
    return errorResponse('Username already claimed', 409, 'taken');
  }

  const suiClient = new SuiJsonRpcClient({ url: suiRpcUrl, network: SUI_NETWORK });
  const suinsClient = new SuinsClient({ client: suiClient, network: SUI_NETWORK });

  let tx;
  try {
    tx = buildAddLeafTx(suinsClient, { label, targetAddress: callerAddress });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build mint PTB';
    console.error('[reserve] buildAddLeafTx threw:', message);
    return errorResponse('Failed to build mint transaction', 500);
  }

  let txDigest: string;
  try {
    // [S18-F6 / vercel-logs L1+L2+L3] Wrap in withSuiRetry to absorb:
    //   - Sui RPC 429s (34 failures / 12h pre-fix)
    //   - Shared-object stale-version contention on the audric registry
    //     ("Transaction needs to be rebuilt..." — 7 failures / 12h pre-fix)
    //   - Shared-object lock contention (2 failures / 12h pre-fix)
    // The audric registry is a single Sui shared object — concurrent claims
    // race for the same version. Sui checkpoint cadence (~250ms) advances the
    // version; signAndExecuteTransaction internally re-resolves the latest
    // version on each call, so retrying after a small backoff resolves
    // contention without manual tx rebuild.
    //
    // On-chain reverts (Move aborts, insufficient gas) are NOT transient —
    // we throw them inside the closure so withSuiRetry's matcher rejects
    // them on the first attempt and the caller surfaces the real error.
    const result = await withSuiRetry(
      () =>
        suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: { showEffects: true },
        }),
      { label: 'reserve:mint' },
    );
    if (result.effects?.status?.status !== 'success') {
      throw new Error(
        `Mint tx reverted on-chain: ${result.effects?.status?.error ?? 'unknown reason'}`,
      );
    }
    txDigest = result.digest;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mint execution failed';
    console.error('[reserve] signAndExecuteTransaction failed:', message);
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
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      console.warn(
        `[reserve] Race lost on DB unique for "${label}" after on-chain mint ${txDigest}. Revoking leaf.`,
      );
      try {
        const revokeTx = buildRevokeLeafTx(suinsClient, { label });
        await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: revokeTx,
          options: { showEffects: false },
        });
      } catch (revokeErr) {
        console.error(
          `[reserve] ORPHAN: leaf ${handle} → ${callerAddress} minted at ${txDigest} but DB write lost race AND revoke failed:`,
          revokeErr instanceof Error ? revokeErr.message : revokeErr,
        );
      }
      return errorResponse('Username was claimed by another user moments ago', 409, 'taken');
    }
    console.error(
      `[reserve] ORPHAN: leaf ${handle} → ${callerAddress} minted at ${txDigest} but DB write failed:`,
      err instanceof Error ? err.message : err,
    );
    return errorResponse(
      'Username minted on-chain but database write failed. Contact support with this code: ' +
        txDigest.slice(0, 12),
      500,
    );
  }

  // [S18-F13 — May 2026] Write-through cache update so the freshly-
  // claimed handle is visible to subsequent picker checks IMMEDIATELY,
  // not after the negative TTL expires. Pre-fix: a picker check from
  // user B in the 10–30s after user A's mint would read a stale
  // negative cache entry → render "AVAILABLE" → user B's reserve would
  // then 409 with "Username was claimed by another user moments ago"
  // (correct on the chain side, infuriating on the UX side).
  // Best-effort — a failed cache write means the next reader pays for
  // one live RPC call, never breaks the response we just succeeded on.
  await invalidateAndWarmSuins(handle, callerAddress);

  return NextResponse.json({
    success: true,
    label,
    fullHandle: handle,
    txDigest,
    walletAddress: callerAddress,
  } satisfies ReserveSuccessBody);
}
