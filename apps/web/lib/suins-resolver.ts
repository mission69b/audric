/**
 * SuiNS resolver — browser-side wrapper around `/api/suins/resolve`.
 *
 * Use this when a user types a `*.sui` name as a transfer recipient.
 * Returns the resolved `0x...64-hex` address, or throws a `SuinsResolutionError`
 * with a user-friendly reason when the name doesn't resolve.
 *
 * The classification of failure modes matters because the LLM narrates the
 * error to the user — generic `Error('not found')` messages cause it to
 * confabulate ("I tried that already" — the bug we're fixing here). Each
 * error code below maps to a specific narration the LLM can pass through
 * truthfully.
 *
 * Usage:
 * ```
 * try {
 *   const address = await resolveSuiNs('adeniyi.sui');
 *   // address is `0x...64-hex`
 * } catch (err) {
 *   if (err instanceof SuinsResolutionError && err.code === 'not_registered') {
 *     // tell the user the name isn't taken yet
 *   }
 * }
 * ```
 */

export type SuinsResolutionErrorCode =
  | 'invalid_format'    // Doesn't look like a SuiNS name (`.sui` suffix etc.)
  | 'not_registered'    // Format valid, but RPC returned null
  | 'rpc_failure'       // Upstream RPC error / timeout / network
  | 'unknown';          // Catch-all for anything else

export class SuinsResolutionError extends Error {
  constructor(
    public readonly code: SuinsResolutionErrorCode,
    message: string,
    public readonly name_: string,
  ) {
    super(message);
    this.name = 'SuinsResolutionError';
  }
}

const SUINS_NAME_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.sui$/;

/**
 * Returns true if the input *looks like* a SuiNS name (ends in `.sui`,
 * contains only allowed characters). Synchronous, no network calls. Use
 * this to decide whether to call `resolveSuiNs` at all.
 */
export function looksLikeSuiNs(input: string): boolean {
  if (!input) return false;
  return SUINS_NAME_REGEX.test(input.trim().toLowerCase());
}

/**
 * Resolve a SuiNS name to a Sui address. Throws `SuinsResolutionError` on
 * failure. Returns the resolved address on success.
 *
 * Server-side (`/api/suins/resolve/route.ts`) does the actual JSON-RPC
 * call against the BlockVision-keyed Sui RPC — keeps the BV API key
 * server-only and gives us shared retry/cache budget across users.
 */
export async function resolveSuiNs(rawName: string): Promise<string> {
  const name = rawName.trim().toLowerCase();
  if (!SUINS_NAME_REGEX.test(name)) {
    throw new SuinsResolutionError(
      'invalid_format',
      `"${rawName}" doesn't look like a SuiNS name. Names must end in .sui (e.g. alex.sui).`,
      rawName,
    );
  }

  let res: Response;
  try {
    res = await fetch(`/api/suins/resolve?name=${encodeURIComponent(name)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SuinsResolutionError(
      'rpc_failure',
      `Couldn't reach the SuiNS resolver to look up "${rawName}" (${msg}). Try again, or paste the full Sui address.`,
      rawName,
    );
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      // ignore JSON parse failures, fall through with HTTP status
    }
    throw new SuinsResolutionError(
      'rpc_failure',
      `SuiNS lookup failed for "${rawName}" (${detail}). Try again, or paste the full Sui address.`,
      rawName,
    );
  }

  let body: { address: string | null; name: string };
  try {
    body = (await res.json()) as { address: string | null; name: string };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SuinsResolutionError(
      'rpc_failure',
      `SuiNS resolver returned an unexpected response for "${rawName}" (${msg}).`,
      rawName,
    );
  }

  if (!body.address) {
    throw new SuinsResolutionError(
      'not_registered',
      `"${rawName}" isn't a registered SuiNS name. Double-check the spelling, or paste the recipient's full Sui address (0x... 64 hex characters).`,
      rawName,
    );
  }

  return body.address;
}
