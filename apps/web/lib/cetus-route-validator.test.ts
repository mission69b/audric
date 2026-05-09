/**
 * [SPEC 20.2 / D-1..D-5] Unit tests for the Cetus route validator.
 *
 * Covers every failure mode that should drop to `undefined` (legacy
 * fallback) and the happy path that returns a usable `SwapRouteResult`.
 * The contract is "never throws, never returns a wrong route" — so the
 * tests focus on the boundary conditions that could violate either.
 *
 * Builds serialized routes by hand (string amounts, Record paths) instead
 * of round-tripping through `serializeCetusRoute` so the test stays a
 * pure unit test on the validator — no `bn.js` dep, no Cetus SDK touch.
 */
import { describe, it, expect } from 'vitest';
import { validateAndDecodeCetusRoute } from './cetus-route-validator';
import { USDC_TYPE, SUI_TYPE, type SerializedCetusRoute } from '@t2000/sdk';

function makeSerializedRoute(opts: {
  fromCoinType?: string;
  toCoinType?: string;
  discoveredAt?: number;
} = {}): SerializedCetusRoute {
  return {
    fromCoinType: opts.fromCoinType ?? USDC_TYPE,
    toCoinType: opts.toCoinType ?? SUI_TYPE,
    discoveredAt: opts.discoveredAt ?? Date.now(),
    amountIn: '1000000',
    amountOut: '500000000',
    byAmountIn: true,
    priceImpact: 0.001,
    insufficientLiquidity: false,
    routerData: {
      amountIn: '1000000',
      amountOut: '500000000',
      byAmountIn: true,
      paths: [
        {
          id: 'p1',
          direction: true,
          provider: 'CETUS',
          from: opts.fromCoinType ?? USDC_TYPE,
          target: opts.toCoinType ?? SUI_TYPE,
          feeRate: 100,
          amountIn: '1000000',
          amountOut: '500000000',
        },
      ],
      insufficientLiquidity: false,
      deviationRatio: 0,
    },
  };
}

describe('validateAndDecodeCetusRoute', () => {
  it('returns undefined when raw is null', () => {
    expect(validateAndDecodeCetusRoute(null, 'USDC', 'SUI')).toBeUndefined();
  });

  it('returns undefined when raw is undefined', () => {
    expect(validateAndDecodeCetusRoute(undefined, 'USDC', 'SUI')).toBeUndefined();
  });

  it('returns undefined when from symbol is unknown', () => {
    const r = makeSerializedRoute();
    expect(validateAndDecodeCetusRoute(r, 'BOGUS', 'SUI')).toBeUndefined();
  });

  it('returns undefined when to symbol is unknown', () => {
    const r = makeSerializedRoute();
    expect(validateAndDecodeCetusRoute(r, 'USDC', 'BOGUS')).toBeUndefined();
  });

  it('returns undefined when raw is malformed (decode throws)', () => {
    expect(validateAndDecodeCetusRoute({ garbage: true }, 'USDC', 'SUI')).toBeUndefined();
  });

  it('returns undefined when coin types do not match (D-2)', () => {
    const r = makeSerializedRoute();
    // Route is USDC→SUI, but caller asks for SUI→USDC — must reject
    expect(validateAndDecodeCetusRoute(r, 'SUI', 'USDC')).toBeUndefined();
  });

  it('returns undefined when route is stale (D-3)', () => {
    const r = makeSerializedRoute({ discoveredAt: Date.now() - 5 * 60 * 1000 });
    expect(validateAndDecodeCetusRoute(r, 'USDC', 'SUI')).toBeUndefined();
  });

  it('returns a deserialized SwapRouteResult on the happy path', () => {
    const r = makeSerializedRoute();
    const decoded = validateAndDecodeCetusRoute(r, 'USDC', 'SUI');
    expect(decoded).toBeDefined();
    expect(decoded?.amountIn).toBe('1000000');
    expect(decoded?.amountOut).toBe('500000000');
    expect(decoded?.byAmountIn).toBe(true);
    expect(decoded?.priceImpact).toBeCloseTo(0.001);
  });

  it('is case-insensitive on token symbols (resolveTokenType handles casing)', () => {
    const r = makeSerializedRoute();
    expect(validateAndDecodeCetusRoute(r, 'usdc', 'sui')).toBeDefined();
  });
});
