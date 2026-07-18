// Offering payload validation (t2 ACP Phase 1) — ONE validator for both
// write paths: the signed machine route (api.t2000.ai /v1/agent/offering)
// and the console's owner-session editor (/api/agent/offerings). Pure module
// (no server-only, no DB) so either side can import it.
//
// Offerings are CONTRACT-SHAPED at list time: a listed offering must always
// be able to fund a valid a2a_escrow Job (price ≤ the job cap, SLA ≤ the
// deliver horizon, review ≤ the review cap). Callers pass the price cap
// (MAX_JOB_USDC from @t2000/sdk) so this package doesn't grow an SDK dep.

export const MAX_SLA_MINUTES = 365 * 24 * 60; // MAX_DELIVER_HORIZON_MS
export const MAX_REVIEW_MINUTES = 30 * 24 * 60; // MAX_REVIEW_WINDOW_MS
export const MAX_REQUIREMENTS_BYTES = 8 * 1024;
export const OFFERING_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;

export type OfferingUpsert = {
  slug: string;
  name: string;
  description: string;
  priceUsdc: number;
  slaMinutes: number;
  reviewWindowMinutes: number;
  rejectSplitBps: number;
  requirements: unknown;
  deliverable: string;
};

/** Parse + validate an offering upsert payload. Returns the normalized
 *  payload, or a human-readable error string. */
export function parseOfferingUpsert(
  raw: unknown,
  opts: { maxPriceUsdc: number }
): { ok: true; offering: OfferingUpsert } | string {
  const b = (raw ?? {}) as Record<string, unknown>;
  const slug = String(b.slug ?? "")
    .trim()
    .toLowerCase();
  if (!OFFERING_SLUG_RE.test(slug)) {
    return "slug must be 2-48 chars of [a-z0-9-], starting alphanumeric.";
  }
  const name = String(b.name ?? "").trim();
  if (name.length === 0 || name.length > 80) {
    return "name is required (max 80 chars).";
  }
  const description = String(b.description ?? "").trim();
  if (description.length === 0 || description.length > 2000) {
    return "description is required (max 2000 chars).";
  }
  const deliverable = String(b.deliverable ?? "").trim();
  if (deliverable.length === 0 || deliverable.length > 1000) {
    return "deliverable is required (max 1000 chars).";
  }
  const priceUsdc = Number(b.priceUsdc);
  if (
    !Number.isFinite(priceUsdc) ||
    priceUsdc < 0.01 ||
    priceUsdc > opts.maxPriceUsdc
  ) {
    return `priceUsdc must be between 0.01 and ${opts.maxPriceUsdc} (the escrow job cap).`;
  }
  const slaMinutes = Number(b.slaMinutes);
  if (
    !Number.isInteger(slaMinutes) ||
    slaMinutes < 5 ||
    slaMinutes > MAX_SLA_MINUTES
  ) {
    return `slaMinutes must be an integer between 5 and ${MAX_SLA_MINUTES}.`;
  }
  const reviewWindowMinutes = Number(b.reviewWindowMinutes ?? 1440);
  if (
    !Number.isInteger(reviewWindowMinutes) ||
    reviewWindowMinutes < 0 ||
    reviewWindowMinutes > MAX_REVIEW_MINUTES
  ) {
    return `reviewWindowMinutes must be an integer between 0 and ${MAX_REVIEW_MINUTES}.`;
  }
  const rejectSplitBps = Number(b.rejectSplitBps ?? 8000);
  if (
    !Number.isInteger(rejectSplitBps) ||
    rejectSplitBps < 0 ||
    rejectSplitBps > 10_000
  ) {
    return "rejectSplitBps must be an integer between 0 and 10000.";
  }
  const requirements = b.requirements ?? null;
  if (requirements !== null) {
    const isText = typeof requirements === "string";
    const isSchema =
      typeof requirements === "object" && !Array.isArray(requirements);
    if (!(isText || isSchema)) {
      return "requirements must be a string (free text) or a JSON-schema object.";
    }
    const bytes = new TextEncoder().encode(JSON.stringify(requirements)).length;
    if (bytes > MAX_REQUIREMENTS_BYTES) {
      return `requirements too large (max ${MAX_REQUIREMENTS_BYTES} bytes).`;
    }
  }
  return {
    ok: true,
    offering: {
      slug,
      name,
      description,
      priceUsdc,
      slaMinutes,
      reviewWindowMinutes,
      rejectSplitBps,
      requirements,
      deliverable,
    },
  };
}
