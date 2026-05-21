// Skeleton variant mapper. Ported from
// `apps/web/components/engine/cards/skeleton-variants.ts` by Phase
// 5a.4 (renderer migration sweep, 2026-05-19). Verbatim except the
// `pay_api` branch — web-v2 doesn't expose `pay_api` to the LLM yet
// (Phase 4b deferral / Agentic Commerce spec), so the helper still
// recognises the tool name (LLM emit shouldn't break the mapper) but
// the variant is no longer expected to render. The mapping stays in
// place so that when Agentic Commerce ships, skeleton coverage is
// already wired.

import type { SkeletonVariant } from './SkeletonCard';

const TOOL_TO_VARIANT: Record<string, SkeletonVariant | null> = {
  // Compact (single-row reads)
  rates_info: 'compact',
  swap_quote: 'compact',
  health_check: 'compact',
  token_prices: 'compact',
  volo_stats: 'compact',
  pending_rewards: 'compact',

  // Wide (multi-row analytics + receipts)
  balance_check: 'wide',
  portfolio_analysis: 'wide',
  savings_info: 'wide',
  activity_summary: 'wide',
  yield_summary: 'wide',
  explain_tx: 'wide',
  protocol_deep_dive: 'wide',
  create_payment_link: 'wide',
  create_invoice: 'wide',
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

  // List (multi-row catalog/history)
  transaction_history: 'list',
  mpp_services: 'list',
  web_search: 'list',
  list_payment_links: 'list',
  list_invoices: 'list',

  // Chip (single-line confirmations)
  cancel_payment_link: 'chip',
  cancel_invoice: 'chip',
  resolve_suins: 'chip',

  // Tools with no card
  spending_analytics: null,
  render_canvas: null,
};

export function getSkeletonVariant(
  toolName: string,
  input?: unknown,
): SkeletonVariant | null {
  if (toolName === 'pay_api') {
    return getPayApiSkeletonVariant(input);
  }
  return TOOL_TO_VARIANT[toolName] ?? null;
}

function getPayApiSkeletonVariant(input?: unknown): SkeletonVariant {
  if (!input || typeof input !== 'object') return 'receipt';
  const url = (input as { url?: unknown }).url;
  if (typeof url !== 'string') return 'receipt';
  if (url.includes('/images/')) return 'media-image';
  if (url.includes('/audio/')) return 'media-audio';
  if (url.includes('/speech')) return 'media-audio';
  if (url.includes('text-to-speech')) return 'media-audio';
  return 'receipt';
}
