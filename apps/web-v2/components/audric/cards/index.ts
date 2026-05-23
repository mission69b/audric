// Barrel for Audric card renderers. Ported from
// `apps/web/components/engine/cards/index.ts` by Phase 5a.4 (renderer
// migration sweep, 2026-05-19).
//
// Founder-locked trim notes (S.178):
//   - V1 BalanceCard / HealthCard NOT ported — V2 absorbs the `variant`
//     prop; the post-write branch is deferred to Phase 5c when
//     PostWriteRefreshSurface lands.
//   - ServiceCatalogCard + MppReceiptGrid + DownloadableArtifact NOT
//     ported — deferred to Agentic Commerce
//     (`spec/active/AGENTIC_COMMERCE_SPEC_DRAFT.md`).

export {
  CardShell,
  DetailRow,
  Gauge,
  MiniBar,
  MonoLabel,
  StatusBadge,
  SuiscanLink,
  TrendIndicator,
  extractData,
  fmtAmt,
  fmtPct,
  fmtRelativeTime,
  fmtTvl,
  fmtUsd,
  fmtYield,
} from './primitives';

export { ActivitySummaryCard } from './ActivitySummaryCard';
export { BalanceCardV2 } from './BalanceCardV2';
export { ConfirmationChip } from './ConfirmationChip';
export { ExplainTxCard } from './ExplainTxCard';
export { HealthCardV2 } from './HealthCardV2';
// [V07E_INVOICE_DEPRECATION / S.269 item 7 — 2026-05-23] InvoiceCard
// deleted. Payment links absorb the invoicing use case; PaymentLinkCard
// renders both link and (formerly) invoice intents.
export { PaymentLinkCard } from './PaymentLinkCard';
export { PendingRewardsCardV2 } from './PendingRewardsCardV2';
export { PortfolioCardV2 } from './PortfolioCardV2';
export { PriceCard } from './PriceCard';
// [S.277 — 2026-05-23] ProtocolCard / SearchResultsCard / StakingCard
// deleted. Their engine tools (`protocol_deep_dive`, `web_search`,
// `volo_stats` / `volo_stake` / `volo_unstake`) were cut in the
// "Earns Its Keep" audit (engine 2.18.0).
export { RatesCardV2 } from './RatesCardV2';
export { SavingsCard } from './SavingsCard';
export type { SkeletonVariant } from './SkeletonCard';
export { SkeletonCard } from './SkeletonCard';
export { getSkeletonVariant } from './skeleton-variants';
export { SuinsResolution } from './SuinsResolution';
export { SwapQuoteCardV2 } from './SwapQuoteCardV2';
export { TransactionHistoryCard } from './TransactionHistoryCard';
export { TransactionReceiptCard } from './TransactionReceiptCard';
export { YieldEarningsCard } from './YieldEarningsCard';
