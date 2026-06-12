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
// [SPEC_AUDRIC_DEFI_REMOVAL §2e — 2026-06-10] DeFi read/write entries
// removed with their tools + cards. `withdraw` / `repay_debt` /
// `swap_quote` / `swap_execute` survive the §2d grace window only.

import type { SkeletonVariant } from './SkeletonCard';

const TOOL_TO_VARIANT: Record<string, SkeletonVariant | null> = {
  // Compact (single-row reads)
  swap_quote: 'compact',

  // Wide (multi-row receipts)
  withdraw: 'wide',
  send_transfer: 'wide',
  swap_execute: 'wide',
  repay_debt: 'wide',
};

export function getSkeletonVariant(
  toolName: string,
): SkeletonVariant | null {
  return TOOL_TO_VARIANT[toolName] ?? null;
}
