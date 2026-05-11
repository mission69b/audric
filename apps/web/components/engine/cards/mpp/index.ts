/**
 * SPEC 23B-MPP1 — MPP renderer barrel.
 *
 * Public surface: only `renderMppService` + `PayApiResult` are needed by
 * the consumer (`ToolResultCard.CARD_RENDERERS['pay_api']`, wired in
 * SPEC 23B-MPP2). Individual primitives + chrome stay private to this
 * folder so consumers can't accidentally couple to them — every
 * per-vendor decision goes through the registry.
 *
 * If a future surface (e.g. ReviewCard from B-MPP6) needs to render the
 * SAME per-vendor preview alongside something else, add the renderer
 * export here — don't reach inside.
 */

export { renderMppService, normaliseServiceSlug, MPP_SERVICE_RENDERERS } from './registry';
export type { PayApiResult, MppServiceRenderer } from './registry';
