// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C2 — Skeleton variant mapper
//
// Maps a tool name (and for `pay_api`, its input URL) to a SkeletonCard
// variant. Single source of truth so ToolBlockView doesn't need a giant
// switch and so per-tool variant choices are testable in isolation.
//
// The mapping follows the CARD_RENDERERS table in
// `components/engine/ToolResultCard.tsx`:
//
//   ToolResultCard renderer       → SkeletonVariant
//   ─────────────────────────────────────────────────
//   RatesCard / SwapQuoteCard /
//   PriceCard / StakingCard /
//   HealthCard (compact)          → 'compact'
//
//   BalanceCard / PortfolioCard /
//   SavingsCard / ActivitySummaryCard /
//   YieldEarningsCard / ExplainTxCard /
//   ProtocolCard / TransactionReceiptCard /
//   PaymentLinkCard / InvoiceCard
//   PendingRewardsCard            → 'wide'
//
//   TransactionHistoryCard /
//   ServiceCatalogCard /
//   SearchResultsCard             → 'list'
//
//   ConfirmationChip cases /
//   SuinsResolution               → 'chip'
//
//   pay_api (image URL)           → 'media-image'
//   pay_api (audio URL)           → 'media-audio'
//   pay_api (other)               → 'receipt'
//
// Tools that render `null` (refinement payloads, tools with no card)
// return `null` from this mapper — caller treats `null` as "skip skeleton".
// ───────────────────────────────────────────────────────────────────────────

import type { SkeletonVariant } from './SkeletonCard';

const TOOL_TO_VARIANT: Record<string, SkeletonVariant | null> = {
  // ─── Compact (single-row reads) ─────────────────────────────────────────
  rates_info: 'compact',
  swap_quote: 'compact',
  health_check: 'compact',
  token_prices: 'compact',
  volo_stats: 'compact',
  pending_rewards: 'compact',

  // ─── Wide (multi-row analytics + receipts) ──────────────────────────────
  balance_check: 'wide',
  portfolio_analysis: 'wide',
  savings_info: 'wide',
  activity_summary: 'wide',
  yield_summary: 'wide',
  explain_tx: 'wide',
  protocol_deep_dive: 'wide',
  create_payment_link: 'wide',
  create_invoice: 'wide',
  // Write tools — all route to TransactionReceiptCard (~3-row receipt).
  // Skeleton flashes briefly between user-confirm and tool_result; for
  // auto-tier writes (sub-threshold pay_api, send_transfer < $10, etc.)
  // it covers the entire sponsored-tx round-trip (~2-4s).
  save_deposit: 'wide',
  withdraw: 'wide',
  send_transfer: 'wide',
  swap_execute: 'wide',
  volo_stake: 'wide',
  volo_unstake: 'wide',
  borrow: 'wide',
  repay_debt: 'wide',
  claim_rewards: 'wide',
  harvest_rewards: 'wide',

  // ─── List (multi-row catalog/history) ───────────────────────────────────
  transaction_history: 'list',
  mpp_services: 'list',
  web_search: 'list',
  list_payment_links: 'list',
  list_invoices: 'list',

  // ─── Chip (single-line confirmations) ───────────────────────────────────
  cancel_payment_link: 'chip',
  cancel_invoice: 'chip',
  save_contact: 'chip',
  resolve_suins: 'chip',

  // ─── Tools with no card ─────────────────────────────────────────────────
  // Returning null here means ToolBlockView skips the skeleton entirely
  // for these tools — same as today's behavior where they render no card.
  spending_analytics: null,
  render_canvas: null, // Routed through CanvasModal, not a card
};

/**
 * Map a tool name (and optional input shape) to a skeleton variant.
 * Returns `null` for tools with no card surface — caller should skip
 * the skeleton in that case to match the eventual no-card render.
 *
 * Special case: `pay_api`'s variant depends on the request URL because
 * different vendors render different surfaces (image vs audio vs receipt).
 * We read `input.url` to choose the variant up-front so the skeleton's
 * geometry matches the eventual `<CardPreview>` / `<TrackPlayer>` /
 * `<VendorReceipt>`.
 */
export function getSkeletonVariant(
  toolName: string,
  input?: unknown,
): SkeletonVariant | null {
  if (toolName === 'pay_api') {
    return getPayApiSkeletonVariant(input);
  }
  // `?? null` because Object.prototype lookup would otherwise return
  // `undefined` for unknown tool names, which TypeScript narrows to
  // `SkeletonVariant | undefined` and would skip the explicit-null branch
  // below in callers.
  return TOOL_TO_VARIANT[toolName] ?? null;
}

function getPayApiSkeletonVariant(input?: unknown): SkeletonVariant {
  if (!input || typeof input !== 'object') return 'receipt';
  const url = (input as { url?: unknown }).url;
  if (typeof url !== 'string') return 'receipt';
  // Image generation endpoints (DALL-E v1/images/generations, future
  // vendors via /images/* paths)
  if (url.includes('/images/')) return 'media-image';
  // Audio endpoints — TTS (OpenAI audio/speech, ElevenLabs
  // text-to-speech/{voice}), Whisper transcription (audio/transcriptions).
  // Both render through TrackPlayer when the result is binary audio;
  // transcription returns text but the LATENCY window is the same
  // (~3-5s) so a media-audio skeleton fits the perceptual feel even
  // when the eventual card is a text receipt.
  if (url.includes('/audio/')) return 'media-audio';
  if (url.includes('/speech')) return 'media-audio';
  if (url.includes('text-to-speech')) return 'media-audio';
  // Lob, Resend, PDFShift, Teleflora, Amazon, etc. — terminal receipts
  // with no media area.
  return 'receipt';
}
