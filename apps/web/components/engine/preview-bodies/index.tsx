'use client';

import type { ReactNode } from 'react';
import { SAVE_FEE_BPS, BORROW_FEE_BPS } from '@t2000/sdk';
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
// FEE ACCURACY (post-audit fix, 2026-05-16):
//   Fee constants are imported from @t2000/sdk to match the actual fees
//   charged in `audric/apps/web/app/api/transactions/prepare/route.ts`:
//     - save_deposit: SAVE_FEE_BPS    (10 bps, 0.10%) — wired in feeHooks.save
//     - borrow:       BORROW_FEE_BPS  (5 bps,  0.05%) — wired in feeHooks.borrow
//     - withdraw:     NO FEE — prepare route returns directly without a hook
//     - repay_debt:   NO FEE — prepare route returns directly without a hook
//     - harvest_rewards: per-leg description (10 bps Cetus + 10 bps NAVI save)
//   Pre-fix V2 displayed "0.10% NAVI overlay" on borrow/withdraw/repay —
//   the borrow row was 2× inflated and the withdraw/repay rows invented
//   fees that don't exist. spec-consistency.ts:19-20 documents the
//   no-WITHDRAW_FEE / no-REPAY_FEE invariant explicitly.
//
// APY ACCURACY (post-audit fix, 2026-05-16):
//   save_deposit + withdraw render the supply APY correctly (it's the same
//   pool APY the user is depositing into / forgoing). borrow + repay_debt
//   intentionally OMIT the APY row — the engine doesn't thread borrow APY
//   onto the PendingAction today, and showing the supply APY as the borrow
//   rate is misleading (NAVI borrow rates are typically 1–2 percentage
//   points HIGHER than supply rates). When engine adds `borrowApyBps` to
//   the PendingAction (Week 4 cleanup), the row slots back in.
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
//
// usdValue=amount assumption: save/borrow/repay/withdraw assets are
// constrained to USDC | USDsui by the SDK allow-list (see
// .cursor/rules/savings-usdc-only.mdc). Both stables peg to ~$1, so
// `usdValue = amount` is correct. If the saveable allow-list ever
// expands beyond stables, this assumption breaks — but the same SDK
// guard would have to relax first, so the constraint is naturally
// load-bearing.
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_USDC_APY_BPS = 462;
const DEFAULT_USDSUI_APY_BPS = 520;

// SDK exports fee constants as bigint — convert once at module scope.
const SAVE_FEE_BPS_NUM = Number(SAVE_FEE_BPS);
const BORROW_FEE_BPS_NUM = Number(BORROW_FEE_BPS);

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

function feeChip(feeBps: number): { label: string; usdFor(amount: number): number } {
  return {
    label: `${(feeBps / 100).toFixed(2)}% NAVI overlay`,
    usdFor: (amount: number) => (amount * feeBps) / 10_000,
  };
}

interface PreviewBodyProps {
  input: Record<string, unknown>;
  ratesOverride?: { usdcApyBps?: number; usdsuiApyBps?: number };
}

// ─── Per-tool bodies ──────────────────────────────────────────────────────

export function SaveDepositPreviewBody({
  input,
  ratesOverride,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  const apyBps = resolveApyBpsForAsset(asset, ratesOverride);
  const fee = feeChip(SAVE_FEE_BPS_NUM);

  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Deposit"
      />
      <APYRow asset={asset} apyBps={apyBps} label="Pool APY" />
      <FeeRow label={fee.label} usdValue={fee.usdFor(amount)} />
    </div>
  );
}

export function WithdrawPreviewBody({
  input,
  ratesOverride,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  const apyBps = resolveApyBpsForAsset(asset, ratesOverride);
  // No fee row — withdraw is fee-free per audric prepare route.
  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Withdraw"
      />
      <APYRow asset={asset} apyBps={apyBps} label="Yield foregone" />
    </div>
  );
}

export function BorrowPreviewBody({
  input,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  const fee = feeChip(BORROW_FEE_BPS_NUM);
  // No APY row — engine doesn't thread borrow rate onto PendingAction.
  // Showing the supply rate would lie about the actual borrow cost.
  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Borrow"
      />
      <div className="text-[10px] text-fg-muted italic pt-1">
        Variable rate — locked at execute time.
      </div>
      <FeeRow label={fee.label} usdValue={fee.usdFor(amount)} />
    </div>
  );
}

export function RepayPreviewBody({
  input,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  // No fee row — repay is fee-free per audric prepare route.
  // No APY row — engine doesn't thread borrow rate onto PendingAction.
  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Repay"
      />
      <div className="text-[10px] text-fg-muted italic pt-1">
        Clears principal at the current variable borrow rate.
      </div>
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
 *
 * Per-tool fee bps are sourced from `@t2000/sdk` (SAVE_FEE_BPS,
 * BORROW_FEE_BPS) — no override needed; the canonical fee values
 * are single-source-of-truth in the SDK constants.
 */
export function renderPreviewBody(
  toolName: string,
  input: Record<string, unknown>,
  options?: {
    ratesOverride?: { usdcApyBps?: number; usdsuiApyBps?: number };
  },
): ReactNode | null {
  const Body = PREVIEW_BODIES[toolName];
  if (!Body) return null;
  return (
    <Body
      input={input}
      ratesOverride={options?.ratesOverride}
    />
  );
}

export const SUPPORTED_PREVIEW_TOOLS = Object.keys(PREVIEW_BODIES);
