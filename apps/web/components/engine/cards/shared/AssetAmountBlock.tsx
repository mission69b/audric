'use client';

import { fmtUsd, fmtAmt } from '../primitives';
import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// Day 6 — AssetAmountBlock (TOOL_UX_DESIGN_v07a.md, B+ plan)
//
// Shared render primitive used by 12 engine tools (post-Day-10 migration):
//   balance_check (per-token row), portfolio_analysis (wallet + DeFi rows),
//   pending_rewards (per-claimable row), harvest_rewards (per-leg row),
//   claim_rewards (per-claim row), save_deposit (deposit amount),
//   withdraw (withdraw amount), swap_quote (in-leg + out-leg),
//   swap_execute (receipt row), borrow (borrowed amount),
//   repay_debt (repay amount), send_transfer (sent amount).
//
// Single-line layout: optional logo · large amount + asset · grey USD value.
// `label` slots a small uppercase eyebrow above the amount (e.g. "DEPOSIT",
// "TO", "RECEIVES"); `suffix` slots a small grey trailer after the USD value
// (e.g. "· cached 5m", "· max"). When `usdValue === null` the USD slot
// renders an em-dash so unpriced positions don't read as $0.00.
//
// Numbers use the same formatting helpers (`fmtUsd`, `fmtAmt`) as every
// other card primitive, so visual parity with BalanceCard / HealthCard is
// automatic. No new design tokens.
//
// Tests live alongside this file; storybook is intentionally absent
// (audric uses inline render + DOM assertions per repo convention).
// ───────────────────────────────────────────────────────────────────────────

interface AssetAmountBlockProps {
  asset: string;
  amount: number;
  usdValue: number | null;
  logo?: string;
  label?: string;
  suffix?: string;
  /** Optional className extension (e.g. cell-padding overrides). */
  className?: string;
}

export function AssetAmountBlock({
  asset,
  amount,
  usdValue,
  logo,
  label,
  suffix,
  className,
}: AssetAmountBlockProps) {
  const usdText = usdValue == null ? '—' : `$${fmtUsd(usdValue)}`;

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {label && (
        <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-fg-muted">
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-2">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            className="w-4 h-4 rounded-full self-center shrink-0"
          />
        )}
        <span className="text-fg-primary text-sm font-medium">
          {fmtAmt(amount)}
          <span className="ml-1 text-fg-muted text-xs font-mono uppercase tracking-wider">
            {asset}
          </span>
        </span>
        <span className="text-fg-muted text-xs ml-auto">
          {usdText}
          {suffix && (
            <span className="text-fg-muted text-[10px] font-mono ml-1">
              {suffix}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
