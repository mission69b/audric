'use client';

import type { ReactNode } from 'react';
import {
  AssetAmountBlock,
  APYBlock,
} from '@/components/engine/cards/shared';
import { fmtUsd } from '@/components/engine/cards/primitives';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 37 v0.7a Phase 2 Day 17-22 — Write-tool preview bodies
//
// Per TOOL_UX_DESIGN_v07a.md (locked 2026-05-15):
//   Pattern: generative-UI (HITL preview)
//   Shared components: PreviewCard wrapper (Day 9) + AssetAmountBlock /
//                      APYBlock / RouteDiagram per tool
//
// Scope decision (vs the design baseline):
//   The design baseline uses PreviewCard as the wrapper with built-in
//   Cancel + Confirm buttons. PermissionCard ALREADY ships chrome for
//   the write flow — timer countdown, Deny / Approve / Refresh-quote
//   buttons, modifiable-field inputs, guard-injection hints, and the
//   WorkingState transition after approve. Wrapping the body in
//   PreviewCard (which has its OWN buttons) would either:
//     (a) double the buttons (Cancel + Deny, Confirm + Approve), or
//     (b) require re-implementing PermissionCard's machinery in the
//         per-tool components — every regenerate / age-badge / timer
//         contract gets re-derived 5 times.
//
//   The pragmatic compromise: keep PermissionCard's chrome, replace
//   ONLY the `inputSummary` <p> (the single-line "save 50 USDC" text)
//   with a richer body component that uses the shared primitives.
//   Each body is pure render — receives the action's `input`, returns
//   JSX. PermissionCard threads the body in via a flag-gated branch.
//
// What the previews cover (current engine emit shape):
//   - save_deposit / withdraw / borrow / repay_debt: { amount, asset? }
//   - harvest_rewards:                                 { slippage?, minRewardUsd? }
//
// What the previews INTENTIONALLY do NOT cover (deferred until engine
// extends PendingAction shape):
//   - HF projection (current → projected) for borrow/withdraw/repay —
//     engine doesn't thread current HF onto the PendingAction today.
//     Once the engine adds `currentHF` (Week 4 cleanup batch alongside
//     buildTool→tool() migration), the body components add HFGauge
//     trivially using the Day 7 primitive that already supports
//     projection. Component API is stable across that future change.
//   - Per-swap-leg RouteDiagram for harvest_rewards — the engine's
//     PendingAction for harvest_rewards doesn't currently include the
//     planned-route preview (the route is computed at execute-time
//     post-approval). When that ships, harvest body slots in
//     RouteDiagram via the Day 8 primitive.
//
// Default APY values (mirrors BalanceCardV2): NAVI USDC pool ~4.62%
// (462 bps), USDsui pool ~5.20% (520 bps). Same long-running ballpark
// values; per-card overrides flow in via the body's optional
// rates-override prop when an upstream rates_info turn is hot.
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_USDC_APY_BPS = 462;
const DEFAULT_USDSUI_APY_BPS = 520;
const DEFAULT_OVERLAY_FEE_BPS = 10;

const SECTION_LABEL =
  'text-[9px] font-mono uppercase tracking-[0.14em] text-fg-muted';

interface BasePreviewInput {
  amount?: number;
  asset?: string;
}

function resolveAsset(input: BasePreviewInput, fallback = 'USDC'): string {
  const raw = input.asset;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw;
  return fallback;
}

function resolveApyBpsForAsset(
  asset: string,
  override?: { usdcApyBps?: number; usdsuiApyBps?: number },
): number {
  if (asset === 'USDsui') return override?.usdsuiApyBps ?? DEFAULT_USDSUI_APY_BPS;
  return override?.usdcApyBps ?? DEFAULT_USDC_APY_BPS;
}

interface FeeRowProps {
  label: string;
  usdValue?: number;
}

function FeeRow({ label, usdValue }: FeeRowProps) {
  return (
    <div className="flex justify-between items-baseline pt-2 border-t border-border-subtle text-[11px]">
      <span className={SECTION_LABEL}>{label}</span>
      {usdValue != null && (
        <span className="text-fg-muted font-mono tabular-nums">
          ${usdValue.toFixed(2)}
        </span>
      )}
    </div>
  );
}

interface APYRowProps {
  asset: string;
  apyBps: number;
  label: string;
}

function APYRow({ asset, apyBps, label }: APYRowProps) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={SECTION_LABEL}>{label}</span>
      <APYBlock asset={asset} apyBps={apyBps} />
    </div>
  );
}

interface PreviewBodyProps {
  input: Record<string, unknown>;
  ratesOverride?: { usdcApyBps?: number; usdsuiApyBps?: number };
  /** Overlay fee applied to the operation, in basis points. Defaults to 10 (0.10%). */
  overlayFeeBps?: number;
}

// ─── Per-tool bodies ──────────────────────────────────────────────────────

export function SaveDepositPreviewBody({
  input,
  ratesOverride,
  overlayFeeBps = DEFAULT_OVERLAY_FEE_BPS,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  const apyBps = resolveApyBpsForAsset(asset, ratesOverride);
  const feePct = (overlayFeeBps / 100).toFixed(2);
  const feeUsd = (amount * overlayFeeBps) / 10_000;

  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Deposit"
      />
      <APYRow asset={asset} apyBps={apyBps} label="Pool APY" />
      <FeeRow label={`${feePct}% NAVI overlay`} usdValue={feeUsd} />
    </div>
  );
}

export function WithdrawPreviewBody({
  input,
  ratesOverride,
  overlayFeeBps = DEFAULT_OVERLAY_FEE_BPS,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  const apyBps = resolveApyBpsForAsset(asset, ratesOverride);
  const feePct = (overlayFeeBps / 100).toFixed(2);
  const feeUsd = (amount * overlayFeeBps) / 10_000;

  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Withdraw"
      />
      <APYRow asset={asset} apyBps={apyBps} label="Yield foregone" />
      <FeeRow label={`${feePct}% NAVI overlay`} usdValue={feeUsd} />
    </div>
  );
}

export function BorrowPreviewBody({
  input,
  ratesOverride,
  overlayFeeBps = DEFAULT_OVERLAY_FEE_BPS,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  // Borrow APY isn't the same as save APY but engine doesn't thread it
  // onto the PendingAction today. Default to the supply APY as a
  // ballpark — when engine adds `borrowApyBps`, this swaps trivially.
  const apyBps = resolveApyBpsForAsset(asset, ratesOverride);
  const feePct = (overlayFeeBps / 100).toFixed(2);
  const feeUsd = (amount * overlayFeeBps) / 10_000;

  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Borrow"
      />
      <APYRow asset={asset} apyBps={apyBps} label="Borrow rate" />
      <FeeRow label={`${feePct}% NAVI overlay`} usdValue={feeUsd} />
    </div>
  );
}

export function RepayPreviewBody({
  input,
  ratesOverride,
  overlayFeeBps = DEFAULT_OVERLAY_FEE_BPS,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  const apyBps = resolveApyBpsForAsset(asset, ratesOverride);
  const feePct = (overlayFeeBps / 100).toFixed(2);
  const feeUsd = (amount * overlayFeeBps) / 10_000;

  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Repay"
      />
      <APYRow asset={asset} apyBps={apyBps} label="Borrow rate cleared" />
      <FeeRow label={`${feePct}% NAVI overlay`} usdValue={feeUsd} />
    </div>
  );
}

interface HarvestPreviewInput {
  slippage?: number;
  minRewardUsd?: number;
}

export function HarvestRewardsPreviewBody({
  input,
}: {
  input: Record<string, unknown>;
}): ReactNode {
  const h = input as HarvestPreviewInput;
  const slipPct =
    typeof h.slippage === 'number' ? (h.slippage * 100).toFixed(2) : '1.00';
  const minRewardLabel =
    typeof h.minRewardUsd === 'number' && h.minRewardUsd > 0
      ? `Min reward · $${fmtUsd(h.minRewardUsd)}`
      : null;

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-fg-secondary">
        Compound all pending rewards in one transaction —
        <span className="text-fg-primary font-medium"> claim → swap each non-USDC reward to USDC → deposit merged USDC into savings</span>.
      </div>
      <div className="space-y-1.5 pt-2 border-t border-border-subtle">
        <div className="flex justify-between items-baseline text-[11px]">
          <span className={SECTION_LABEL}>Per-swap slippage</span>
          <span className="text-fg-primary font-mono tabular-nums">
            {slipPct}%
          </span>
        </div>
        {minRewardLabel && (
          <div className="flex justify-between items-baseline text-[11px]">
            <span className={SECTION_LABEL}>Threshold</span>
            <span className="text-fg-primary font-mono tabular-nums">
              {minRewardLabel}
            </span>
          </div>
        )}
        <div className="flex justify-between items-baseline text-[11px]">
          <span className={SECTION_LABEL}>Per-leg fee</span>
          <span className="text-fg-muted font-mono tabular-nums">
            0.10% Cetus + 0.10% NAVI
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

const PREVIEW_BODIES: Record<
  string,
  (props: PreviewBodyProps) => ReactNode
> = {
  save_deposit: SaveDepositPreviewBody,
  withdraw: WithdrawPreviewBody,
  borrow: BorrowPreviewBody,
  repay_debt: RepayPreviewBody,
  harvest_rewards: HarvestRewardsPreviewBody,
};

/**
 * Returns a V2 preview body for the given write tool, or `null` if the
 * tool isn't covered (caller falls back to the legacy `inputSummary`
 * single-line text).
 */
export function renderPreviewBody(
  toolName: string,
  input: Record<string, unknown>,
  options?: {
    ratesOverride?: { usdcApyBps?: number; usdsuiApyBps?: number };
    overlayFeeBps?: number;
  },
): ReactNode | null {
  const Body = PREVIEW_BODIES[toolName];
  if (!Body) return null;
  return (
    <Body
      input={input}
      ratesOverride={options?.ratesOverride}
      overlayFeeBps={options?.overlayFeeBps}
    />
  );
}

export const SUPPORTED_PREVIEW_TOOLS = Object.keys(PREVIEW_BODIES);
