/**
 * SPEC 23B-MPP1 + SPEC 24 F3 — MPP service renderer registry.
 *
 * The `pay_api` engine tool routes to MPP gateway services. Pre-SPEC-24,
 * the audric registry carried 12 vendor entries — but the Phase 1 audit
 * (see `spec/SPEC_24_GATEWAY_INVENTORY.md` §4) found that 7 of those were
 * DEAD (services not actually deployed on the gateway: suno, teleflora,
 * cakeboss, amazon, walmart, partycity, party-city) and 2 were misnamed
 * aliases (dalle, dall-e — actual gateway slug is `openai`).
 *
 * SPEC 24 F3 (this rewrite, locked 2026-05-11) prunes the registry to the
 * **5 services Audric officially supports** (per SPEC_24_GATEWAY_INVENTORY.md
 * §8). Every other gateway service falls through to `<GenericMppReceipt>` —
 * but that path should be RARE, because the system prompt (engine 1.29.0,
 * SPEC 24 F1) teaches the LLM to decline honestly for unsupported vendors
 * instead of routing through pay_api hoping the result will render.
 *
 * Locked supported set:
 *
 *   openai      — endpoint-aware: DALL-E → CardPreview, Whisper/chat → VendorReceipt
 *   elevenlabs  — TrackPlayer (TTS + sound-gen both audio)
 *   pdfshift    — BookCover (HTML/URL → PDF)
 *   lob         — VendorReceipt (postcards / letters / address-verify)
 *   resend      — VendorReceipt (transactional + batch email)
 *
 * Add-back recipe (when a dropped service comes back online — e.g. Fal Recraft
 * for Audric Store creators wanting branded vector art, or Suno when Phase 5
 * deploys it):
 *
 *   1. Add ONE line to `MPP_SERVICE_RENDERERS` below:
 *        fal: (data) => <CardPreview data={data} />,
 *
 *   2. Add ONE line to `getPayApiGlyph` in `AgentStep.tsx` (SPEC 24 F4):
 *        if (url.includes('/fal/')) return '✦';
 *
 *   3. Add ONE line to the system prompt's § MPP services block:
 *        fal — image gen $0.03 (Flux Dev / Pro / Recraft / Realism)
 *
 *   4. Add ONE smoke-harness test in `apps/web/scripts/smoke-mpp.ts` (Phase 3).
 *
 * Total cost per add-back: ~5 min. Documented here so the operator who needs
 * to re-enable a service can do it without re-reading SPEC 24.
 *
 * Architecture (unchanged from MPP1):
 *   1. PayApiResult — mirrors `ServiceResult` from `hooks/useAgent.ts`.
 *      No `tx` field, only `paymentDigest`.
 *   2. MppServiceRenderer — `(data: PayApiResult) => ReactNode`. Pure fn.
 *   3. MPP_SERVICE_RENDERERS — map keyed on the normalised vendor slug
 *      (first path segment of `serviceId`).
 *   4. renderMppService(data) — dispatch fn with fallback to
 *      `<GenericMppReceipt>`.
 *
 * Wiring (unchanged from MPP2): `CARD_RENDERERS['pay_api']` in
 * `ToolResultCard.tsx` calls `renderMppService(extractData(result))`.
 * Each primitive is self-contained — owns its chrome AND its `<SuiscanLink>`
 * (rendered automatically by `<MppCardShell txDigest={data.paymentDigest}>`).
 */

import type { ReactNode } from 'react';
import { CardPreview } from './CardPreview';
import { TrackPlayer } from './TrackPlayer';
import { BookCover } from './BookCover';
import { VendorReceipt } from './VendorReceipt';
import { GenericMppReceipt } from './GenericMppReceipt';

/**
 * Shape passed to every renderer. Mirrors `ServiceResult` (returned by
 * `executeToolAction.pay_api`) PLUS the legacy passthrough fields kept for
 * `<GenericMppReceipt>` graceful-degradation. All fields optional — every
 * renderer must be defensive against the absent/null shapes (engine
 * errors, in-flight states, vendor schema drift).
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
  // Legacy fields kept for `<GenericMppReceipt>` graceful-degradation.
  // ServiceResult never sets these — they're remnants of an older shape
  // assumed by the dead `TransactionReceiptCard.getHeroLines.pay_api`
  // branch. Safe to remove once GenericMppReceipt's display logic stops
  // reading them.
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
 * SPEC 24 F3 — endpoint-aware OpenAI dispatch.
 *
 * The `openai` vendor exposes 3 supported endpoints (DALL-E images,
 * Whisper transcription, GPT-4o chat — see `SERVICE_PRICES` in the engine
 * `pay.ts` for pricing). Each endpoint produces a different result shape:
 *   - images/generations  → returns image URL → CardPreview
 *   - audio/transcriptions → returns transcript text → VendorReceipt
 *   - chat/completions    → returns completion text → VendorReceipt
 *
 * Dispatch on `serviceId` substring (which equals the gateway path with the
 * `https://mpp.t2000.ai/` prefix stripped; e.g. `openai/v1/images/generations`).
 * Fall-through returns VendorReceipt for any future supported openai endpoint.
 */
function renderOpenai(data: PayApiResult): ReactNode {
  const serviceId = data.serviceId ?? '';
  if (serviceId.includes('/v1/images/generations')) {
    return <CardPreview data={data} />;
  }
  // Whisper transcription, GPT-4o chat, and any future text-result endpoint
  // render as an OpenAI vendor receipt (vendor tag tells the user which
  // vendor was billed, the cost line tells them how much).
  return <VendorReceipt data={data} vendor="OpenAI" />;
}

/**
 * Vendor-slug → renderer map. SPEC 24 F3 (locked 2026-05-11): pruned to the
 * 5 supported services. Every other vendor falls through to
 * `<GenericMppReceipt>` (the catch-all path should be RARE — system prompt
 * keeps the LLM in the supported set).
 *
 * Adding a vendor back: see the add-back recipe in the file header.
 */
export const MPP_SERVICE_RENDERERS: Record<string, MppServiceRenderer> = {
  openai: renderOpenai,
  elevenlabs: (data) => <TrackPlayer data={data} />,
  pdfshift: (data) => <BookCover data={data} />,
  lob: (data) => <VendorReceipt data={data} vendor="Lob" />,
  resend: (data) => <VendorReceipt data={data} vendor="Resend" />,
};

/**
 * Dispatch entry point. B-MPP2 will register this in `CARD_RENDERERS` of
 * `ToolResultCard.tsx` (`pay_api: (result) => renderMppService(result.data)`),
 * bypassing the dead `TransactionReceiptCard.pay_api` branch. Returns the
 * `<GenericMppReceipt>` fallback when the slug isn't in the registry, so
 * unknown vendors still render a passable card.
 */
export function renderMppService(data: PayApiResult): ReactNode {
  const slug = normaliseServiceSlug(data.serviceId);
  const renderer = MPP_SERVICE_RENDERERS[slug];
  if (renderer) return renderer(data);
  return <GenericMppReceipt data={data} />;
}
