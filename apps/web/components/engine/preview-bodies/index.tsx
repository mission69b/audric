'use client';

import type { ReactNode } from 'react';
import { SAVE_FEE_BPS, BORROW_FEE_BPS } from '@t2000/sdk/browser';
import {
  AssetAmountBlock,
  APYBlock,
} from '@/components/engine/cards/shared';
import { fmtUsd } from '@/components/engine/cards/primitives';
import { cn } from '@/lib/cn';

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
// APY ACCURACY (post-audit fix, 2026-05-16; updated Day 14a, 2026-05-16):
//   save_deposit + withdraw render the supply APY correctly (it's the
//   same pool APY the user is depositing into / forgoing). borrow +
//   repay_debt take their APY from the engine's `borrowApyBps` field on
//   the PendingAction (SPEC 37 Week 4 cleanup, engine 1.34.10+). When
//   the field is absent (NAVI MCP unavailable / engine < 1.34.10), the
//   bodies fall back to the pre-Week-4 italic disclaimer — honest
//   degradation, no fabricated rates.
//
// HF ROW (added Day 14a, 2026-05-16):
//   borrow / repay_debt / withdraw / save_deposit now render the user's
//   current health factor inline when the engine threads `currentHF` on
//   the PendingAction (engine 1.34.10+). Just the current value — no
//   projection. Projection requires additional NAVI position data
//   (supplied / borrowed / liquidationThreshold) that the engine does
//   not currently thread; when it does, the bodies upgrade to the
//   HFGauge primitive's projection mode trivially.
//
// What the previews INTENTIONALLY do NOT cover yet:
//   - HF projection (current → projected) — needs engine to thread the
//     supplied/borrowed/ltv NAVI numbers OR a precomputed projected HF.
//   - Per-swap-leg RouteDiagram for harvest_rewards — the engine's
//     PendingAction for harvest_rewards doesn't currently include the
//     planned-route preview (route is computed at execute-time
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

// [Day 14a / 2026-05-16, extended Day 14c / 2026-05-16]
// Compact health-factor row for confirm cards. Uses the same
// SECTION_LABEL styling as APYRow / FeeRow so the preview body reads
// as a single ledger.
//
// HF wire semantics (Day 14c, engine 1.34.13+):
//   - number → finite HF (real debt)
//   - null   → ∞ sentinel (no debt = infinitely safe)
//   - undefined → row hides entirely
//
// When `projectedHF` is present, renders "current → projected" so the
// user sees the HF impact before approving. Color tier always reflects
// the WORST of the two (projection-after, almost always) — that's the
// state they're approving into.
function formatHF(hf: number | null): string {
  if (hf === null || !Number.isFinite(hf) || hf >= 99) return '∞';
  return hf.toFixed(2);
}

function hfColor(hf: number | null): string {
  if (hf === null) return 'text-success-solid';
  if (hf < 1.1) return 'text-error-solid';
  if (hf < 1.5) return 'text-warning-solid';
  return 'text-success-solid';
}

function HFRow({
  healthFactor,
  projected,
}: {
  healthFactor: number | null;
  projected?: number | null;
}) {
  const hasProjection = projected !== undefined;
  const tierTarget = hasProjection ? projected : healthFactor;
  const color = hfColor(tierTarget);

  return (
    <div className="flex justify-between items-baseline">
      <span className={SECTION_LABEL}>Health factor</span>
      <span className={cn('font-mono tabular-nums text-[12px]', color)}>
        {hasProjection ? (
          <>
            <span className="text-fg-muted">{formatHF(healthFactor)}</span>
            <span className="text-fg-muted px-1">→</span>
            <span>{formatHF(projected)}</span>
          </>
        ) : (
          formatHF(healthFactor)
        )}
      </span>
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
  /**
   * [Day 14a / 2026-05-16] Live borrow APY in basis points from the
   * engine's PendingAction (1.34.10+). Drives the borrow/repay APY row
   * when present; bodies fall back to the italic disclaimer when
   * undefined (NAVI MCP unavailable / engine < 1.34.10).
   */
  borrowApyBps?: number;
  /**
   * [Day 14a / 2026-05-16, extended Day 14c / 2026-05-16] Current
   * health factor from the engine's PendingAction (1.34.10+). Drives
   * the HF row on borrow / repay / withdraw / save_deposit when
   * present. `null` is the deliberate ∞ sentinel (no debt =
   * infinitely safe); `undefined` hides the row entirely.
   */
  currentHF?: number | null;
  /**
   * [Day 14c / 2026-05-16] Projected health factor AFTER the write
   * executes. Engine 1.34.13+ computes this in
   * enrichPendingActionWithLiveData from live NAVI position data +
   * the input amount. Same `number | null | undefined` semantics as
   * `currentHF`. When present, HFRow renders "current → projected".
   */
  projectedHF?: number | null;
}

// ─── Per-tool bodies ──────────────────────────────────────────────────────

export function SaveDepositPreviewBody({
  input,
  ratesOverride,
  currentHF,
  projectedHF,
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
      {currentHF !== undefined && (
        <HFRow healthFactor={currentHF} projected={projectedHF} />
      )}
      <FeeRow label={fee.label} usdValue={fee.usdFor(amount)} />
    </div>
  );
}

export function WithdrawPreviewBody({
  input,
  ratesOverride,
  currentHF,
  projectedHF,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  const apyBps = resolveApyBpsForAsset(asset, ratesOverride);
  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Withdraw"
      />
      <APYRow asset={asset} apyBps={apyBps} label="Yield foregone" />
      {currentHF !== undefined && (
        <HFRow healthFactor={currentHF} projected={projectedHF} />
      )}
    </div>
  );
}

export function BorrowPreviewBody({
  input,
  borrowApyBps,
  currentHF,
  projectedHF,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  const fee = feeChip(BORROW_FEE_BPS_NUM);
  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Borrow"
      />
      {borrowApyBps !== undefined ? (
        <APYRow asset={asset} apyBps={borrowApyBps} label="Borrow rate" />
      ) : (
        <div className="text-[10px] text-fg-muted italic pt-1">
          Variable rate — locked at execute time.
        </div>
      )}
      {currentHF !== undefined && (
        <HFRow healthFactor={currentHF} projected={projectedHF} />
      )}
      <FeeRow label={fee.label} usdValue={fee.usdFor(amount)} />
    </div>
  );
}

export function RepayPreviewBody({
  input,
  borrowApyBps,
  currentHF,
  projectedHF,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === 'number' ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, 'USDC');
  return (
    <div className="space-y-3">
      <AssetAmountBlock
        asset={asset}
        amount={amount}
        usdValue={amount}
        label="Repay"
      />
      {borrowApyBps !== undefined ? (
        <APYRow asset={asset} apyBps={borrowApyBps} label="Borrow rate cleared" />
      ) : (
        <div className="text-[10px] text-fg-muted italic pt-1">
          Clears principal at the current variable borrow rate.
        </div>
      )}
      {currentHF !== undefined && (
        <HFRow healthFactor={currentHF} projected={projectedHF} />
      )}
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
    /** [Day 14a] Live borrow APY (bps) from PendingAction. */
    borrowApyBps?: number;
    /** [Day 14a] Current health factor from PendingAction. `null` = ∞. */
    currentHF?: number | null;
    /** [Day 14c] Projected health factor from PendingAction. `null` = ∞. */
    projectedHF?: number | null;
  },
): ReactNode | null {
  const Body = PREVIEW_BODIES[toolName];
  if (!Body) return null;
  return (
    <Body
      input={input}
      ratesOverride={options?.ratesOverride}
      borrowApyBps={options?.borrowApyBps}
      currentHF={options?.currentHF}
      projectedHF={options?.projectedHF}
    />
  );
}

export const SUPPORTED_PREVIEW_TOOLS = Object.keys(PREVIEW_BODIES);
