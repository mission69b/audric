'use client';

import type { ReactNode } from 'react';
import { CardShell } from '../primitives';
import { HFGauge } from './HFGauge';
import { cn } from '@/lib/cn';

// ───────────────────────────────────────────────────────────────────────────
// Day 9 (a) — PreviewCard (TOOL_UX_DESIGN_v07a.md, B+ plan)
//
// Shared wrapper for the four write-tool preview cards rendered when the
// engine yields a `pending_action` event (HITL pause):
//   save_deposit  → PreviewCard with body=SaveDepositPreview
//   withdraw      → PreviewCard with body=WithdrawPreview
//   borrow        → PreviewCard with body=BorrowPreview
//   repay_debt    → PreviewCard with body=RepayPreview
//
// Per the Audric Passport "you decide" pillar (CLAUDE.md), every write
// gets a tap-to-confirm card. PreviewCard is the canonical shape:
//
//   ┌───────────────────────────────────────────────┐
//   │ <heading>                                     │
//   ├───────────────────────────────────────────────┤
//   │ <body>  ← caller-supplied; uses               │
//   │          AssetAmountBlock / APYBlock / etc.   │
//   ├───────────────────────────────────────────────┤
//   │ HFGauge (optional, only when relevant)        │
//   ├───────────────────────────────────────────────┤
//   │ Fee row (optional)                            │
//   ├───────────────────────────────────────────────┤
//   │            [Cancel]   [<confirmLabel>]        │
//   └───────────────────────────────────────────────┘
//
// `onConfirm` and `onCancel` are wired by the calling timeline view to the
// resume-route POST (confirm) or the discard-pending-action mutation
// (cancel). PreviewCard itself is render-only — no API calls, no
// transaction-builder coupling.
//
// Why a single wrapper? Without one, each write tool's preview card would
// re-derive the heading row + HF gauge slot + fee row + button row from
// scratch. Centralizing them here means the 4 write-tool flows share
// the same look + the same interaction pattern + the same a11y wiring,
// and shipping a polish pass to all four is one PR.
// ───────────────────────────────────────────────────────────────────────────

export interface HFImpact {
  /** Current HF before the action lands. */
  current: number;
  /** Projected HF after the action lands. */
  projected: number;
  /** Liquidation threshold for the gauge (NAVI = 1.0). */
  liquidationThreshold: number;
  /** Short label for the projection row, e.g. "after borrow". */
  label: string;
}

export interface FeeBreakdown {
  /** Display label, e.g. "0.1% NAVI overlay" or "0.1% Cetus + 0.1% NAVI". */
  label: string;
  /** Optional explicit USD breakdown (e.g. "$0.05"). */
  usdValue?: number;
}

interface PreviewCardProps {
  heading: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  /** Disables the confirm button (e.g. while the resume request is in flight). */
  busy?: boolean;
  healthFactorImpact?: HFImpact;
  feeBreakdown?: FeeBreakdown;
  /** Optional className extension for the outer card wrapper. */
  className?: string;
}

export function PreviewCard({
  heading,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  healthFactorImpact,
  feeBreakdown,
  className,
}: PreviewCardProps) {
  return (
    <div className={className}>
      <CardShell title={heading}>
        <div className="space-y-3">
          <div>{body}</div>

          {healthFactorImpact && (
            <div className="pt-2 border-t border-border-subtle">
              <HFGauge
                healthFactor={healthFactorImpact.current}
                liquidationThreshold={healthFactorImpact.liquidationThreshold}
                projection={{
                  healthFactor: healthFactorImpact.projected,
                  label: healthFactorImpact.label,
                }}
              />
            </div>
          )}

          {feeBreakdown && (
            <div className="flex justify-between items-baseline pt-2 border-t border-border-subtle text-xs">
              <span className="text-fg-muted">{feeBreakdown.label}</span>
              {feeBreakdown.usdValue != null && (
                <span className="text-fg-muted font-mono tabular-nums">
                  ${feeBreakdown.usdValue.toFixed(2)}
                </span>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md border border-border-subtle text-fg-muted',
                  'hover:bg-surface-sunken transition disabled:opacity-50',
                )}
              >
                Cancel
              </button>
            )}
            {onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md font-medium',
                  'bg-fg-primary text-bg-primary',
                  'hover:opacity-80 transition disabled:opacity-50',
                )}
              >
                {busy ? 'Confirming…' : confirmLabel}
              </button>
            )}
          </div>
        </div>
      </CardShell>
    </div>
  );
}
