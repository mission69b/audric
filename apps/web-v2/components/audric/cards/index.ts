// Barrel for Audric card renderers. Ported from
// `apps/web/components/engine/cards/index.ts` by Phase 5a.4 (renderer
// migration sweep, 2026-05-19).
//
// [SPEC_AUDRIC_DEFI_REMOVAL §2e — 2026-06-10] Render-surface collapse:
// the DeFi read cards (Balance / Health / Savings / Rates / Portfolio /
// Yield / PendingRewards / Price), explorer cards (ActivitySummary /
// TransactionHistory / ExplainTx), the payment-link card (deferred to
// Audric Store), the standalone SuiNS card, and the entire canvas
// subsystem were deleted. Chat renders transactional output only.
//
// Grace-window survivors (cut after the §2d 7-day exit window closes):
// `SwapQuoteCardV2` + the withdraw / repay / swap receipts rendered via
// `TransactionReceiptCard`.

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

export { ConfirmationChip } from './ConfirmationChip';
export type { SkeletonVariant } from './SkeletonCard';
export { SkeletonCard } from './SkeletonCard';
export { getSkeletonVariant } from './skeleton-variants';
export { BundleReceiptCard } from './BundleReceiptCard';
export { SwapQuoteCardV2 } from './SwapQuoteCardV2';
export { TransactionReceiptCard } from './TransactionReceiptCard';
