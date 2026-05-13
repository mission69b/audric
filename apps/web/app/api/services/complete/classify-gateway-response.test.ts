/**
 * classify-gateway-response.test.ts — covers all 3 classification outcomes
 * + the legacy 402 passthrough preservation guarantee.
 *
 * Why the legacy 402-without-verdict passthrough is REQUIRED to stay at 'success':
 * pre-SPEC-26 the gateway emitted bare 402s for mppx auth challenges; the existing
 * `services/complete` route handled those as the success-path fallthrough (line
 * `if (!serviceResponse.ok && serviceResponse.status !== 402)` excludes 402).
 * Routes that have NOT migrated to settle-on-success keep that behavior — anything
 * else would be a silent regression for ~30 unmigrated routes.
 *
 * The settle-no-delivery branch ONLY fires when both conditions hold:
 *   - status === 402, AND
 *   - x-settle-verdict header is present.
 *
 * Pin both halves of that AND so we never accidentally trigger the new branch
 * for a bare mppx 402, and never accidentally fall through to legacy for a
 * SPEC 26 refundable verdict.
 */
import { describe, it, expect } from 'vitest';

import {
  classifyGatewayResponse,
  SETTLE_VERDICT_HEADER,
  SETTLE_REASON_HEADER,
} from './classify-gateway-response';

const buildResponse = (status: number, headers: Record<string, string> = {}): Response =>
  new Response(null, { status, headers });

describe('classifyGatewayResponse', () => {
  describe("'success' outcomes", () => {
    it('200 with no settle headers → success', () => {
      expect(classifyGatewayResponse(buildResponse(200))).toEqual({ kind: 'success' });
    });

    it('204 with no settle headers → success', () => {
      expect(classifyGatewayResponse(buildResponse(204))).toEqual({ kind: 'success' });
    });

    it('202 with no settle headers → success (Lob async accept)', () => {
      expect(classifyGatewayResponse(buildResponse(202))).toEqual({ kind: 'success' });
    });

    it('402 WITHOUT x-settle-verdict header → success (preserves legacy mppx auth-challenge passthrough)', () => {
      expect(classifyGatewayResponse(buildResponse(402))).toEqual({ kind: 'success' });
    });

    it('402 with unrelated headers but no x-settle-verdict → success', () => {
      const res = buildResponse(402, {
        'www-authenticate': 'Payment realm="mpp"',
        'content-type': 'application/problem+json',
      });
      expect(classifyGatewayResponse(res)).toEqual({ kind: 'success' });
    });
  });

  describe("'settle-no-delivery' outcomes (SPEC 26)", () => {
    it('402 with x-settle-verdict: refundable + reason → settle-no-delivery', () => {
      const res = buildResponse(402, {
        [SETTLE_VERDICT_HEADER]: 'refundable',
        [SETTLE_REASON_HEADER]: 'OpenAI 400',
      });
      expect(classifyGatewayResponse(res)).toEqual({
        kind: 'settle-no-delivery',
        verdict: 'refundable',
        reason: 'OpenAI 400',
      });
    });

    it('402 with x-settle-verdict: charge-failed + reason → settle-no-delivery', () => {
      const res = buildResponse(402, {
        [SETTLE_VERDICT_HEADER]: 'charge-failed',
        [SETTLE_REASON_HEADER]: 'mppx insufficient funds',
      });
      expect(classifyGatewayResponse(res)).toEqual({
        kind: 'settle-no-delivery',
        verdict: 'charge-failed',
        reason: 'mppx insufficient funds',
      });
    });

    it('402 with x-settle-verdict but NO x-settle-reason → settle-no-delivery with default reason', () => {
      const res = buildResponse(402, {
        [SETTLE_VERDICT_HEADER]: 'refundable',
      });
      expect(classifyGatewayResponse(res)).toEqual({
        kind: 'settle-no-delivery',
        verdict: 'refundable',
        reason: 'Upstream rejected; no charge.',
      });
    });

    it('402 with future-unknown verdict (e.g. "policy-blocked") → settle-no-delivery, verdict preserved', () => {
      const res = buildResponse(402, {
        [SETTLE_VERDICT_HEADER]: 'policy-blocked',
        [SETTLE_REASON_HEADER]: 'OpenAI content policy',
      });
      const result = classifyGatewayResponse(res);
      expect(result.kind).toBe('settle-no-delivery');
      if (result.kind === 'settle-no-delivery') {
        expect(result.verdict).toBe('policy-blocked');
        expect(result.reason).toBe('OpenAI content policy');
      }
    });

    it('non-402 status with x-settle-verdict header → does NOT match settle branch (header alone is not enough)', () => {
      const res = buildResponse(200, {
        [SETTLE_VERDICT_HEADER]: 'refundable',
      });
      expect(classifyGatewayResponse(res)).toEqual({ kind: 'success' });
    });
  });

  describe("'paid-but-failed' outcomes (legacy worldview, untouched)", () => {
    it('400 → paid-but-failed', () => {
      expect(classifyGatewayResponse(buildResponse(400))).toEqual({ kind: 'paid-but-failed' });
    });

    it('429 → paid-but-failed', () => {
      expect(classifyGatewayResponse(buildResponse(429))).toEqual({ kind: 'paid-but-failed' });
    });

    it('500 → paid-but-failed', () => {
      expect(classifyGatewayResponse(buildResponse(500))).toEqual({ kind: 'paid-but-failed' });
    });

    it('502 → paid-but-failed', () => {
      expect(classifyGatewayResponse(buildResponse(502))).toEqual({ kind: 'paid-but-failed' });
    });

    it('503 with stray x-settle-reason header but no verdict → paid-but-failed', () => {
      const res = buildResponse(503, {
        [SETTLE_REASON_HEADER]: 'this header alone should not promote to settle branch',
      });
      expect(classifyGatewayResponse(res)).toEqual({ kind: 'paid-but-failed' });
    });
  });

});
