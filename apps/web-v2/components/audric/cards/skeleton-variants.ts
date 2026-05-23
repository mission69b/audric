// Skeleton variant mapper. Ported from
// `apps/web/components/engine/cards/skeleton-variants.ts` by Phase
// 5a.4 (renderer migration sweep, 2026-05-19).
//
// [S.245 — 2026-05-22] `pay_api` + `mpp_services` skeleton entries
// removed per V07E_D_QUESTION_AUDITS D-2 reframe. Tools deleted
// from engine entirely; pay_api returns as a Commerce primitive in
// Audric Store SPEC (clean-slate redesign).
// [S.277 — 2026-05-23] `volo_stats` / `volo_stake` / `volo_unstake` /
// `web_search` / `protocol_deep_dive` skeleton entries removed per
// AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23 (engine 2.18.0 cut).

import type { SkeletonVariant } from './SkeletonCard';

const TOOL_TO_VARIANT: Record<string, SkeletonVariant | null> = {
  // Compact (single-row reads)
  rates_info: 'compact',
  swap_quote: 'compact',
  health_check: 'compact',
  token_prices: 'compact',
  pending_rewards: 'compact',

  // Wide (multi-row analytics + receipts)
  balance_check: 'wide',
  portfolio_analysis: 'wide',
  savings_info: 'wide',
  activity_summary: 'wide',
  yield_summary: 'wide',
  explain_tx: 'wide',
  create_payment_link: 'wide',
  save_deposit: 'wide',
  withdraw: 'wide',
  send_transfer: 'wide',
  swap_execute: 'wide',
  borrow: 'wide',
  repay_debt: 'wide',
  claim_rewards: 'wide',
  harvest_rewards: 'wide',

  // List (multi-row catalog/history)
  transaction_history: 'list',
  list_payment_links: 'list',

  // Chip (single-line confirmations)
  cancel_payment_link: 'chip',
  resolve_suins: 'chip',

  // Tools with no card
  spending_analytics: null,
  render_canvas: null,
};

export function getSkeletonVariant(
  toolName: string,
): SkeletonVariant | null {
  return TOOL_TO_VARIANT[toolName] ?? null;
}
