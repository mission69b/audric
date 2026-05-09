/**
 * [SPEC 20.2 / D-1..D-5] Server-side validation + decoding of the
 * engine-emitted Cetus route forwarded by the audric client.
 *
 * The audric client posts an opaque `cetusRoute` field on
 * `/api/transactions/prepare` for swap_execute legs (single + bundled).
 * This module is the single point that turns that opaque field into a
 * usable `SwapRouteResult` for `composeTx`'s `precomputedRoute` fast-path.
 *
 * ## Validation contract
 *
 * Returns `undefined` (never throws) when the route is unusable:
 *  - field is absent / null (legacy session, engine pre-v1.24.15)
 *  - field is malformed (deserialize threw — defensive fallback per D-5)
 *  - coin types don't match the swap inputs (D-2 — wrong route for this swap)
 *  - route exceeds DEFAULT_MAX_AGE_MS (D-3 — stale, must re-discover)
 *  - the from/to symbols can't be resolved to coin types (unknown token)
 *
 * `undefined` is the correct fallback signal: `composeTx` then runs the
 * full `findSwapRoute()` path, same as pre-SPEC-20.2. The route stays a
 * pure performance optimization — never load-bearing for correctness.
 *
 * ## Why a dedicated module
 *
 * Lives outside the route handler so it's testable without HTTP setup.
 * Single source of truth — both single-swap (`swap_execute` body field)
 * and bundle-swap (`steps[].cetusRoute`) call paths import the same
 * function. No drift possible.
 *
 * ## Validation order
 *
 * Structural verify (D-2) BEFORE freshness (D-3) — a wrong-pair route
 * never gets a "stale" log line that could mask a route-mismatch bug.
 * Any throw bubbles into `undefined` so a malformed `cetusRoute` never
 * blocks a swap; the user still gets the trade, just at legacy speed.
 */
import {
  resolveTokenType,
  deserializeCetusRoute,
  verifyCetusRouteCoinMatch,
  isCetusRouteFresh,
  type SwapRouteResult,
  type SerializedCetusRoute,
} from '@t2000/sdk';

export function validateAndDecodeCetusRoute(
  raw: unknown,
  fromSymbol: string,
  toSymbol: string,
): SwapRouteResult | undefined {
  if (raw === null || raw === undefined) return undefined;

  const fromType = resolveTokenType(fromSymbol);
  const toType = resolveTokenType(toSymbol);
  if (!fromType || !toType) return undefined;

  try {
    const serialized = raw as SerializedCetusRoute;
    if (!verifyCetusRouteCoinMatch(serialized, { fromCoinType: fromType, toCoinType: toType })) {
      console.warn('[prepare] cetusRoute coin-type mismatch — falling back to fresh discovery');
      return undefined;
    }
    if (!isCetusRouteFresh(serialized)) {
      console.warn('[prepare] cetusRoute stale — falling back to fresh discovery');
      return undefined;
    }
    return deserializeCetusRoute(serialized);
  } catch (err) {
    console.warn(
      '[prepare] cetusRoute decode failed — falling back to fresh discovery:',
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}
