import {
  looksLikeSuiNs,
  resolveSuiNs,
  SuinsResolutionError,
} from '@/lib/suins-resolver';
import { isAudricHandle } from '@/lib/identity/audric-handle-helpers';

/**
 * SPEC 10 D.5 — Polymorphic identifier resolver for the contacts page +
 * the inline `+` save flow in the send modal.
 *
 * Accepts ANY of:
 *   - Bare Audric handle (e.g. `alice` → resolves via `/api/identity/search`)
 *   - Full Audric handle (e.g. `alice.audric.sui` → resolves via SuiNS)
 *   - Generic SuiNS (e.g. `alex.sui` → resolves via SuiNS, no audricUsername)
 *   - 0x address (passthrough; caller may want to enrich with reverse SuiNS)
 *
 * Returns the canonical 3-tuple needed to construct a unified Contact:
 *   { identifier, resolvedAddress, audricUsername? }
 *
 * Where:
 *   - `identifier` — what the user typed (preserved for display)
 *   - `resolvedAddress` — canonical lowercased 0x for the wire / persistence
 *   - `audricUsername` — present iff this is a confirmed Audric handle
 *
 * Mirrors the resolution order used by `resolveAndSelectSendRecipient` in
 * `dashboard-content.tsx` (saved-contact → SuiNS → 0x). Centralising the
 * logic here lets the contacts page reuse it without forking.
 *
 * Note: the audricUsername populated here is BEST-EFFORT. The full lazy
 * reverse-SuiNS backfill (D.4) runs server-side after persistence — so a
 * contact added by 0x address will gain its audricUsername badge on the
 * next page load.
 */

const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;
const BARE_HANDLE_REGEX = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$|^[a-z]$/;

export type ResolveErrorCode =
  | 'empty'
  | 'invalid_format'
  | 'not_found'
  | 'audric_handle_unknown' // bare handle not registered as audric user
  | 'rpc_failure';

export class IdentifierResolutionError extends Error {
  constructor(
    public readonly code: ResolveErrorCode,
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = 'IdentifierResolutionError';
  }
}

export interface ResolvedIdentifier {
  identifier: string; // what to persist as Contact.identifier (mirrors raw)
  resolvedAddress: string; // canonical lowercased 0x
  audricUsername: string | null; // confirmed Audric handle if known
}

interface AudricSearchHit {
  username: string;
  fullHandle: string;
  address: string;
  claimedAt: string;
}

async function lookupBareAudricHandle(
  bare: string,
): Promise<AudricSearchHit | null> {
  // Use prefix search but require an exact username match to avoid
  // accidentally claiming `alice` for `aliceB`. The endpoint already
  // returns results sorted by relevance; we filter for exact equality.
  const url = `/api/identity/search?q=${encodeURIComponent(bare)}&limit=5`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new IdentifierResolutionError(
      'rpc_failure',
      `Couldn't reach the Audric directory (${msg}). Try again.`,
      bare,
    );
  }
  if (!res.ok) {
    throw new IdentifierResolutionError(
      'rpc_failure',
      `Audric directory lookup failed (HTTP ${res.status}).`,
      bare,
    );
  }
  let body: { results?: AudricSearchHit[] };
  try {
    body = await res.json();
  } catch {
    throw new IdentifierResolutionError(
      'rpc_failure',
      `Unexpected response from Audric directory.`,
      bare,
    );
  }
  if (!Array.isArray(body.results)) return null;
  return body.results.find((r) => r.username === bare) ?? null;
}

export async function resolveIdentifier(
  raw: string,
): Promise<ResolvedIdentifier> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new IdentifierResolutionError('empty', 'Identifier is empty', raw);
  }

  // 1. Bare 0x address — passthrough, normalize to lowercase.
  if (SUI_ADDRESS_REGEX.test(trimmed)) {
    return {
      identifier: trimmed,
      resolvedAddress: trimmed.toLowerCase(),
      audricUsername: null,
    };
  }

  const lower = trimmed.toLowerCase();

  // 2. SuiNS name (anything ending in `.sui`). Distinguishes Audric leaves
  //    (e.g. `alice.audric.sui`) from generic SuiNS (`alex.sui`) by the
  //    suffix predicate — both resolve via the same RPC, but only the
  //    former populates audricUsername.
  if (looksLikeSuiNs(lower)) {
    let address: string;
    try {
      address = await resolveSuiNs(lower);
    } catch (err) {
      if (err instanceof SuinsResolutionError) {
        throw new IdentifierResolutionError(
          err.code === 'not_registered' ? 'not_found' : 'rpc_failure',
          err.message,
          raw,
        );
      }
      throw err;
    }
    return {
      identifier: lower,
      resolvedAddress: address.toLowerCase(),
      audricUsername: isAudricHandle(lower) ? lower : null,
    };
  }

  // 3. Bare Audric handle (no `.sui` suffix, no `0x`). Hit the directory.
  const lowerStripped = lower.startsWith('@') ? lower.slice(1) : lower;
  if (!BARE_HANDLE_REGEX.test(lowerStripped)) {
    throw new IdentifierResolutionError(
      'invalid_format',
      `"${raw}" isn't a valid identifier. Use an Audric handle (alice), a SuiNS name (alice.sui), or a 0x address.`,
      raw,
    );
  }
  const hit = await lookupBareAudricHandle(lowerStripped);
  if (!hit) {
    throw new IdentifierResolutionError(
      'audric_handle_unknown',
      `No Audric user found with handle "${lowerStripped}". Try a SuiNS name (alice.sui) or a 0x address.`,
      raw,
    );
  }
  return {
    identifier: hit.fullHandle,
    resolvedAddress: hit.address.toLowerCase(),
    audricUsername: hit.fullHandle,
  };
}
