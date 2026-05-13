/**
 * classify-gateway-response.ts — pure classifier for MPP gateway responses
 * inside `/api/services/complete`.
 *
 * Three outcomes the route needs to handle separately:
 *
 *   1. 'success'             — gateway delivered. Return the body, log purchase.
 *   2. 'settle-no-delivery'  — SPEC 26 settle-on-success returned 402 with an
 *                              `x-settle-verdict` header (refundable | charge-failed).
 *                              Gateway probed upstream + chose not to consume the
 *                              receipt. From the LLM's perspective: no service was
 *                              delivered, the call is safe to retry.
 *   3. 'paid-but-failed'     — anything else non-2xx (and not a SPEC 26 402).
 *                              Pre-SPEC-26 worldview: gateway accepted the receipt
 *                              but the upstream / mppx step failed afterward.
 *
 * Architectural caveat (revisit when SPEC 26 O-4 `refund(digest)` ships):
 *
 *   In audric's flow the user's USDC moves on-chain (via Enoki) BEFORE the
 *   gateway is called. A `settle-no-delivery` verdict means the gateway did
 *   not consume the payment receipt, BUT the on-chain transfer to treasury
 *   has already happened. The LLM-facing semantics ("you were NOT charged,
 *   safe to retry") are correct as user-experience guidance — re-trying via
 *   pay_api results in a new on-chain transfer + a second probe — but the
 *   first transfer's USDC is currently stuck in treasury until the deferred
 *   `refund(digest)` MPP contract primitive ships (spec O-4, post-Audric-Store).
 *
 *   Until then, the route preserves `paymentDigest` in the response so a
 *   future support / refund flow can locate the orphaned on-chain transfer.
 *
 * The helper is intentionally a pure function over `Response`. It performs
 * no I/O, no logging, no policy decisions — just inspects status + headers
 * and returns a discriminated union the route can switch on. Tests mock
 * Response objects directly; no fetch / mppx / Prisma plumbing required.
 *
 * Sibling-file convention per HANDOFF Lesson 1.0 — Next.js 15 `route.ts`
 * may only export HTTP method handlers + framework config knobs; helpers
 * live in sibling files freely importable from both the route + the test.
 */

export const SETTLE_VERDICT_HEADER = 'x-settle-verdict';
export const SETTLE_REASON_HEADER = 'x-settle-reason';

export type GatewayResponseClassification =
  | { kind: 'success' }
  | {
      kind: 'settle-no-delivery';
      /** SPEC 26 verdict: 'refundable' | 'charge-failed' (and any future verdict). */
      verdict: string;
      /** Operator-facing reason from `x-settle-reason` header; falls back to a generic string. */
      reason: string;
    }
  | { kind: 'paid-but-failed' };

const DEFAULT_SETTLE_REASON = 'Upstream rejected; no charge.';

/**
 * Classify a gateway response into one of three outcomes.
 *
 * Order matters:
 *   - 402 + `x-settle-verdict` header → 'settle-no-delivery' (SPEC 26 path)
 *   - non-2xx (not the above)         → 'paid-but-failed' (legacy path)
 *   - 2xx OR 402 without verdict      → 'success' (legacy 402 passthrough preserved)
 *
 * The legacy "200 + bare 402" passthrough to 'success' is preserved deliberately
 * — pre-SPEC-26 the gateway emitted bare 402s for mppx auth challenges; treating
 * them as success was already the route's behavior. Routes that have NOT migrated
 * to settle-on-success continue to behave identically.
 */
export function classifyGatewayResponse(response: Response): GatewayResponseClassification {
  const settleVerdict = response.headers.get(SETTLE_VERDICT_HEADER);

  if (response.status === 402 && settleVerdict) {
    return {
      kind: 'settle-no-delivery',
      verdict: settleVerdict,
      reason: response.headers.get(SETTLE_REASON_HEADER) ?? DEFAULT_SETTLE_REASON,
    };
  }

  if (!response.ok && response.status !== 402) {
    return { kind: 'paid-but-failed' };
  }

  return { kind: 'success' };
}
