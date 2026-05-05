import { NextRequest, NextResponse } from 'next/server';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { validateInternalKey } from '@/lib/internal-auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/env-diagnostic
 *
 * **TEMPORARY DIAGNOSTIC** (added 2026-05-05, slated for deletion in the
 * follow-up commit once the env-var availability question is answered).
 *
 * Reason this exists: a 2026-05-05 attempt to promote
 * `AUDRIC_PARENT_NFT_PRIVATE_KEY` from `optionalString` to `requiredString`
 * in `lib/env.ts` (commit b31e33f) caused two production deploys to fail
 * even though `vercel env ls` confirmed the variable was scoped to
 * Production + Preview as a Sensitive var. The promotion was reverted
 * (commit f73021e) before we knew whether the failure was:
 *
 *   (A) the var genuinely isn't reaching Node runtime at module-init
 *       (Vercel Sensitive vars unexpected behavior for some configurations)
 *   (B) the var IS reaching runtime, but Zod parsed an unexpected value
 *       (e.g. wrapping quotes, trailing newline, encoding artifact)
 *   (C) some other Next.js / Vercel build interaction we haven't
 *       considered yet
 *
 * This endpoint resolves the question in one curl call by reading the
 * env value at REQUEST time (post-deploy, in production) and reporting
 * metadata WITHOUT revealing the key itself. Three checks:
 *
 *   1. Presence — does `env.AUDRIC_PARENT_NFT_PRIVATE_KEY` resolve?
 *   2. Format — is it Bech32 `suiprivkey1…`?
 *   3. Decodability — does `decodeSuiPrivateKey` parse it as ED25519?
 *      If yes, derive the public address as the unique-but-safe proof
 *      we have the right key (matches RUNBOOK_audric_sui_parent.md §1
 *      `0xaca29165…23d11`).
 *
 * ## Security
 *
 * Gated by `T2000_INTERNAL_KEY` (the same shared secret as every other
 * `/api/internal/*` route). The response contains:
 *   - boolean presence flag
 *   - integer length (Bech32 keys are deterministically sized so this
 *     reveals nothing useful — it's a mismatch detector)
 *   - format string ("bech32" | "unknown")
 *   - scheme string ("ED25519" | "{actual scheme}" | "decode-error")
 *   - derived address string (a known public artifact — the parent NFT
 *     custody address — used purely to confirm "yes this is the right
 *     key for the audric.sui parent")
 *
 * The actual private key is NEVER returned. The presence + length +
 * decoded address combo is enough to answer the diagnostic question
 * without leaking material.
 *
 * ## Deletion plan
 *
 * Per the SPEC 10 P2 close-out, this file MUST be removed in the
 * commit that follows the env-gate decision (promote-to-required OR
 * keep-optional-document-why). Leaving an undocumented `/api/internal/*`
 * route in the codebase is anti-pattern even when it requires a
 * shared-secret to call.
 */

interface DiagnosticResponse {
  keyPresent: boolean;
  keyLength: number | null;
  keyFormat: 'bech32' | 'unknown' | null;
  scheme: string | null;
  derivedAddress: string | null;
  envAccessVia: 'env-proxy';
  vercelDeploymentId: string | null;
  vercelEnv: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const rawKey = env.AUDRIC_PARENT_NFT_PRIVATE_KEY;

  const response: DiagnosticResponse = {
    keyPresent: Boolean(rawKey),
    keyLength: rawKey ? rawKey.length : null,
    keyFormat: rawKey ? (rawKey.startsWith('suiprivkey1') ? 'bech32' : 'unknown') : null,
    scheme: null,
    derivedAddress: null,
    envAccessVia: 'env-proxy',
    vercelDeploymentId: env.VERCEL_DEPLOYMENT_ID ?? null,
    vercelEnv: env.VERCEL_ENV ?? null,
  };

  if (!rawKey) {
    return NextResponse.json(response);
  }

  try {
    const { scheme, secretKey } = decodeSuiPrivateKey(rawKey);
    response.scheme = scheme;

    if (scheme === 'ED25519') {
      const keypair = Ed25519Keypair.fromSecretKey(secretKey);
      response.derivedAddress = keypair.toSuiAddress();
    }
  } catch (err) {
    response.scheme = `decode-error: ${err instanceof Error ? err.message : 'unknown'}`;
  }

  return NextResponse.json(response);
}
