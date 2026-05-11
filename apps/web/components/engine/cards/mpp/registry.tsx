/**
 * SPEC 23B-MPP1 — MPP service renderer registry.
 *
 * The `pay_api` engine tool can route to ~40 different MPP gateway services
 * (DALL-E, Suno, ElevenLabs, PDFShift, Lob, Teleflora, CakeBoss, Amazon, …).
 * Pre-MPP1 every service shared one generic 3-line "Service / Cost / Delivery"
 * receipt — the lowest-fidelity surface in the entire harness despite being
 * the moat for the Audric Store launch.
 *
 * MPP1 (this file) defines the dispatch shape ONLY. It does NOT wire into
 * `TransactionReceiptCard` — that is B-MPP2's job (one-line callsite swap).
 * Splitting the dispatch from the wiring keeps MPP1 pure-additive: zero
 * risk to the existing pay_api receipt while the per-service primitives
 * land + iterate.
 *
 * Architecture:
 *   1. PayApiResult — the shape `executeToolAction.pay_api` returns to the
 *      timeline. Mirrors `ServiceResult` from `hooks/useAgent.ts` plus the
 *      legacy passthrough fields (serviceName / amount / deliveryEstimate)
 *      that the current TransactionReceiptCard branch already reads.
 *   2. MppServiceRenderer — `(data: PayApiResult) => ReactNode`. Pure fn,
 *      no hooks, no side effects. Each renderer extracts its own fields
 *      defensively from `data.result` (vendor-specific shape).
 *   3. MPP_SERVICE_RENDERERS — map keyed on the normalised vendor slug
 *      (first path segment of `serviceId`).
 *   4. renderMppService(data) — dispatch fn with fallback to
 *      <GenericMppReceipt>. This is what B-MPP2 will call from
 *      TransactionReceiptCard.
 *
 * Slug source of truth: `serviceId` from `ServiceResult` (the audric host
 * sets this to the gateway path, e.g. `fal/fal-ai/flux/dev`,
 * `elevenlabs/v1/text-to-speech/...`, `lob/v1/postcards`). NeonDB's
 * `ServicePurchase.serviceId` confirms this shape across the 5 services
 * actually called in production over the last 30d.
 */

import type { ReactNode } from 'react';
import { CardPreview } from './CardPreview';
import { TrackPlayer } from './TrackPlayer';
import { BookCover } from './BookCover';
import { VendorReceipt } from './VendorReceipt';
import { GenericMppReceipt } from './GenericMppReceipt';

/**
 * Shape passed to every renderer. Mirrors `ServiceResult` (returned by
 * `executeToolAction.pay_api`) PLUS the legacy passthrough fields that
 * `TransactionReceiptCard.getHeroLines.pay_api` already reads. All fields
 * optional — every renderer must be defensive against the absent/null
 * shapes (engine errors, in-flight states, vendor schema drift).
 */
export interface PayApiResult {
  /** Sui digest of the on-chain USDC payment leg. Used for SuiscanLink. */
  paymentDigest?: string;
  /** USD price as string (gateway returns it stringified, e.g. `"0.04"`). */
  price?: string;
  /**
   * Gateway service path — e.g. `fal/fal-ai/flux/dev`,
   * `elevenlabs/v1/text-to-speech/eleven_monolingual_v1`,
   * `lob/v1/postcards`. The first path segment is the vendor slug.
   */
  serviceId?: string;
  /** True when the payment leg succeeded on-chain. */
  success?: boolean;
  /** Vendor-specific response body. Shape varies per service. */
  result?: unknown;

  // ─────────────────────────────────────────────────────────────────────
  // Legacy fields that the current TransactionReceiptCard.pay_api branch
  // reads directly. Kept here for migration symmetry — once B-MPP2 lands,
  // GenericMppReceipt is the only consumer that touches these and even
  // there only as a graceful-degradation path.
  // ─────────────────────────────────────────────────────────────────────
  serviceName?: string;
  amount?: number;
  deliveryEstimate?: string;
}

export type MppServiceRenderer = (data: PayApiResult) => ReactNode;

/**
 * Normalise a `serviceId` to a vendor slug.
 *
 *   "fal/fal-ai/flux/dev"           → "fal"
 *   "elevenlabs/v1/text-to-speech"  → "elevenlabs"
 *   "lob/v1/postcards"              → "lob"
 *   "https://mpp.t2000.ai/lob/..."  → "lob"   (gateway prefix stripped)
 *   "/fal/fal-ai/flux/dev"          → "fal"   (leading slash tolerated)
 *   ""                              → ""      (caller falls back to generic)
 *   undefined                       → ""      (defensive)
 *
 * Lower-cased so downstream lookups are case-insensitive.
 */
export function normaliseServiceSlug(serviceId: string | undefined | null): string {
  if (!serviceId) return '';
  // Strip http(s) gateway prefix if present (`https://mpp.t2000.ai/`)
  const stripped = serviceId.replace(/^https?:\/\/[^/]+\//, '');
  // Strip leading slash + take first path segment
  const firstSegment = stripped.replace(/^\/+/, '').split('/')[0] ?? '';
  return firstSegment.toLowerCase();
}

/**
 * Vendor-slug → renderer map. Add entries here as new MPP services come
 * online. Order doesn't matter (key-based lookup).
 *
 * Keys cover the 5 services confirmed in NeonDB last 30d (anthropic, fal,
 * elevenlabs, lob, openweather) plus the demo bar references (suno,
 * pdfshift, teleflora, cakeboss, amazon, walmart, partycity).
 *
 * Aliases: some vendors fan out across multiple gateway names (e.g. the
 * legacy `dalle` slug for what is now `fal/fal-ai/flux/dev`). Both keys
 * route to the same renderer so historical data still pretty-prints.
 */
export const MPP_SERVICE_RENDERERS: Record<string, MppServiceRenderer> = {
  // Image generation → CardPreview
  fal: (data) => <CardPreview data={data} />,
  dalle: (data) => <CardPreview data={data} />,
  'dall-e': (data) => <CardPreview data={data} />,

  // Audio generation → TrackPlayer
  suno: (data) => <TrackPlayer data={data} />,
  elevenlabs: (data) => <TrackPlayer data={data} />,

  // PDF / book binding → BookCover
  pdfshift: (data) => <BookCover data={data} />,

  // Physical-fulfilment vendors → VendorReceipt
  lob: (data) => <VendorReceipt data={data} vendor="Lob" />,
  teleflora: (data) => <VendorReceipt data={data} vendor="Teleflora" />,
  cakeboss: (data) => <VendorReceipt data={data} vendor="CakeBoss" />,
  amazon: (data) => <VendorReceipt data={data} vendor="Amazon" />,
  walmart: (data) => <VendorReceipt data={data} vendor="Walmart" />,
  partycity: (data) => <VendorReceipt data={data} vendor="Party City" />,
  'party-city': (data) => <VendorReceipt data={data} vendor="Party City" />,

  // Data / structured-response vendors → VendorReceipt (default vendor)
  // These ARE called in production but produce text/JSON output that
  // doesn't warrant a bespoke surface. Render as a vendor receipt so
  // the user sees the cost + status without the dead-generic 3-line
  // fallback firing.
  openweather: (data) => <VendorReceipt data={data} vendor="OpenWeather" />,
  anthropic: (data) => <VendorReceipt data={data} vendor="Anthropic" />,
};

/**
 * Dispatch entry point. B-MPP2 will call this from
 * `TransactionReceiptCard.getHeroLines.pay_api` to swap the generic
 * 3-line render for a per-vendor surface. Returns the GenericMppReceipt
 * fallback when the slug isn't in the registry, so unknown vendors still
 * render a passable card (better than the pre-MPP1 generic chrome).
 */
export function renderMppService(data: PayApiResult): ReactNode {
  const slug = normaliseServiceSlug(data.serviceId);
  const renderer = MPP_SERVICE_RENDERERS[slug];
  if (renderer) return renderer(data);
  return <GenericMppReceipt data={data} />;
}
