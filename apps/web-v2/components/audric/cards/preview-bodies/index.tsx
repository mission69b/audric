"use client";

import { SAVE_FEE_BPS, BORROW_FEE_BPS } from "@t2000/sdk/browser";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fmtUsd } from "../primitives";
import { APYBlock, AssetAmountBlock } from "../shared";

// ───────────────────────────────────────────────────────────────────────────
// Write-tool preview bodies — ported into web-v2 by Phase 5d (S.182).
//
// Per-tool richer body components that REPLACE the single-line
// `inputSummary` text in `<PermissionCard>`. Each body uses the shared
// primitives (`AssetAmountBlock`, `APYBlock`) ported in Phase 5a to render
// asset/amount/USD/APY/fee/HF in one ledger-like surface, so the user
// sees what they're signing on-chain BEFORE approving.
//
// Source of truth: `apps/web/components/engine/preview-bodies/index.tsx`.
// Ported verbatim except import paths:
//   - `@/components/engine/cards/shared`       → `../shared`
//   - `@/components/engine/cards/primitives`   → `../primitives`
//   - `@/lib/cn`                                → `@/lib/utils`
//   - `@t2000/sdk/browser` stays as-is (SDK is a direct dep).
//
// Wire degradation (Phase 5d specific):
//   In v0.7c web-v2, the chat route's `buildAudricToolMetadata` threads
//   ONLY `{ description, modifiableFields, attemptId }` to the client.
//   The legacy `borrowApyBps` / `currentHF` / `projectedHF` extension
//   fields aren't on `toolMetadata` yet — they were emitted via the
//   legacy v0.7a PendingAction SSE path. The bodies degrade gracefully:
//   - HFRow: hides when `currentHF === undefined` (legacy contract)
//   - APY: falls back to `DEFAULT_USDC_APY_BPS` / `DEFAULT_USDSUI_APY_BPS`
//     constants when no override is threaded
//   - Borrow APY: shows the italic "Variable rate" disclaimer when
//     `borrowApyBps === undefined`
//
// When/if Phase 5e (Payment Intents) or a follow-on slice extends
// `buildAudricToolMetadata` to thread these fields from the engine's
// PendingAction, the rich rows light up automatically — no body changes
// needed.
//
// FEE ACCURACY:
//   Fee constants imported from @t2000/sdk to match the actual fees
//   charged in `app/api/transactions/prepare/route.ts`:
//     - save_deposit:    SAVE_FEE_BPS    (10 bps, 0.10%) — feeHooks.save_deposit
//     - borrow:          BORROW_FEE_BPS  (5 bps,  0.05%) — feeHooks.borrow
//     - withdraw:        NO FEE — prepare route returns directly
//     - repay_debt:      NO FEE — prepare route returns directly
//     - harvest_rewards: per-leg description (10 bps Cetus + 10 bps NAVI)
//
// usdValue=amount assumption: save/borrow/repay/withdraw assets are
// constrained to USDC | USDsui by the SDK allow-list (see
// .cursor/rules/savings-usdc-only.mdc). Both stables peg to ~$1, so
// `usdValue = amount` is correct.
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_USDC_APY_BPS = 462;
const DEFAULT_USDSUI_APY_BPS = 520;

const SAVE_FEE_BPS_NUM = Number(SAVE_FEE_BPS);
const BORROW_FEE_BPS_NUM = Number(BORROW_FEE_BPS);

const SECTION_LABEL =
  "font-mono text-[9px] text-fg-muted tracking-[0.14em] uppercase";

interface BasePreviewInput {
  amount?: number;
  asset?: string;
}

function resolveAsset(input: BasePreviewInput, fallback = "USDC"): string {
  const raw = input.asset;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw;
  }
  return fallback;
}

function resolveApyBpsForAsset(
  asset: string,
  override?: { usdcApyBps?: number; usdsuiApyBps?: number },
): number {
  if (asset === "USDsui") {
    return override?.usdsuiApyBps ?? DEFAULT_USDSUI_APY_BPS;
  }
  return override?.usdcApyBps ?? DEFAULT_USDC_APY_BPS;
}

interface FeeRowProps {
  label: string;
  usdValue?: number;
}

function FeeRow({ label, usdValue }: FeeRowProps) {
  return (
    <div className="flex items-baseline justify-between border-border-subtle border-t pt-2 text-[11px]">
      <span className={SECTION_LABEL}>{label}</span>
      {usdValue != null && (
        <span className="font-mono text-fg-muted tabular-nums">
          ${usdValue.toFixed(2)}
        </span>
      )}
    </div>
  );
}

interface APYRowProps {
  apyBps: number;
  asset: string;
  label: string;
}

function APYRow({ asset, apyBps, label }: APYRowProps) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={SECTION_LABEL}>{label}</span>
      <APYBlock apyBps={apyBps} asset={asset} />
    </div>
  );
}

// HF wire semantics (legacy contract preserved):
//   - number → finite HF (real debt)
//   - null   → ∞ sentinel (no debt = infinitely safe)
//   - undefined → row hides entirely
//
// When `projectedHF` is present, renders "current → projected" so the
// user sees the HF impact before approving. Color tier reflects the
// projection-after state (almost always the WORST of the two).
function formatHF(hf: number | null): string {
  if (hf === null || !Number.isFinite(hf) || hf >= 9999) {
    return "∞";
  }
  return hf.toFixed(2);
}

function hfColor(hf: number | null): string {
  if (hf === null) {
    return "text-success-solid";
  }
  if (hf < 1.1) {
    return "text-error-solid";
  }
  if (hf < 1.5) {
    return "text-warning-solid";
  }
  return "text-success-solid";
}

function HFRow({
  healthFactor,
  projected,
}: {
  healthFactor: number | null;
  projected?: number | null;
}) {
  const hasProjection = projected !== undefined;
  const tierTarget = hasProjection ? (projected ?? null) : healthFactor;
  const color = hfColor(tierTarget);

  return (
    <div className="flex items-baseline justify-between">
      <span className={SECTION_LABEL}>Health factor</span>
      <span className={cn("font-mono text-[12px] tabular-nums", color)}>
        {hasProjection ? (
          <>
            <span className="text-fg-muted">{formatHF(healthFactor)}</span>
            <span className="px-1 text-fg-muted">→</span>
            <span>{formatHF(projected ?? null)}</span>
          </>
        ) : (
          formatHF(healthFactor)
        )}
      </span>
    </div>
  );
}

function feeChip(feeBps: number): {
  label: string;
  usdFor(amount: number): number;
} {
  return {
    label: `${(feeBps / 100).toFixed(2)}% NAVI overlay`,
    usdFor: (amount: number) => (amount * feeBps) / 10_000,
  };
}

interface PreviewBodyProps {
  borrowApyBps?: number;
  currentHF?: number | null;
  input: Record<string, unknown>;
  projectedHF?: number | null;
  ratesOverride?: { usdcApyBps?: number; usdsuiApyBps?: number };
}

export function SaveDepositPreviewBody({
  input,
  ratesOverride,
  currentHF,
  projectedHF,
}: PreviewBodyProps): ReactNode {
  const amount = typeof input.amount === "number" ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, "USDC");
  const apyBps = resolveApyBpsForAsset(asset, ratesOverride);
  const fee = feeChip(SAVE_FEE_BPS_NUM);

  return (
    <div className="space-y-3">
      <AssetAmountBlock
        amount={amount}
        asset={asset}
        label="Deposit"
        usdValue={amount}
      />
      <APYRow apyBps={apyBps} asset={asset} label="Pool APY" />
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
  const amount = typeof input.amount === "number" ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, "USDC");
  const apyBps = resolveApyBpsForAsset(asset, ratesOverride);

  return (
    <div className="space-y-3">
      <AssetAmountBlock
        amount={amount}
        asset={asset}
        label="Withdraw"
        usdValue={amount}
      />
      <APYRow apyBps={apyBps} asset={asset} label="Yield foregone" />
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
  const amount = typeof input.amount === "number" ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, "USDC");
  const fee = feeChip(BORROW_FEE_BPS_NUM);

  return (
    <div className="space-y-3">
      <AssetAmountBlock
        amount={amount}
        asset={asset}
        label="Borrow"
        usdValue={amount}
      />
      {borrowApyBps === undefined ? (
        <div className="pt-1 text-[10px] text-fg-muted italic">
          Variable rate — locked at execute time.
        </div>
      ) : (
        <APYRow apyBps={borrowApyBps} asset={asset} label="Borrow rate" />
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
  const amount = typeof input.amount === "number" ? input.amount : 0;
  const asset = resolveAsset(input as BasePreviewInput, "USDC");

  return (
    <div className="space-y-3">
      <AssetAmountBlock
        amount={amount}
        asset={asset}
        label="Repay"
        usdValue={amount}
      />
      {borrowApyBps === undefined ? (
        <div className="pt-1 text-[10px] text-fg-muted italic">
          Clears principal at the current variable borrow rate.
        </div>
      ) : (
        <APYRow
          apyBps={borrowApyBps}
          asset={asset}
          label="Borrow rate cleared"
        />
      )}
      {currentHF !== undefined && (
        <HFRow healthFactor={currentHF} projected={projectedHF} />
      )}
    </div>
  );
}

interface HarvestPreviewInput {
  minRewardUsd?: number;
  slippage?: number;
}

export function HarvestRewardsPreviewBody({
  input,
}: {
  input: Record<string, unknown>;
}): ReactNode {
  const h = input as HarvestPreviewInput;
  const slipPct =
    typeof h.slippage === "number" ? (h.slippage * 100).toFixed(2) : "1.00";
  const minRewardLabel =
    typeof h.minRewardUsd === "number" && h.minRewardUsd > 0
      ? `Min reward · $${fmtUsd(h.minRewardUsd)}`
      : null;

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-fg-secondary">
        Compound all pending rewards in one transaction —
        <span className="font-medium text-fg-primary">
          {" "}
          claim → swap each non-USDC reward to USDC → deposit merged USDC into
          savings
        </span>
        .
      </div>
      <div className="space-y-1.5 border-border-subtle border-t pt-2">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className={SECTION_LABEL}>Per-swap slippage</span>
          <span className="font-mono text-fg-primary tabular-nums">
            {slipPct}%
          </span>
        </div>
        {minRewardLabel && (
          <div className="flex items-baseline justify-between text-[11px]">
            <span className={SECTION_LABEL}>Threshold</span>
            <span className="font-mono text-fg-primary tabular-nums">
              {minRewardLabel}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between text-[11px]">
          <span className={SECTION_LABEL}>Per-leg fee</span>
          <span className="font-mono text-fg-muted tabular-nums">
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
  borrow: BorrowPreviewBody,
  harvest_rewards: HarvestRewardsPreviewBody,
  repay_debt: RepayPreviewBody,
  save_deposit: SaveDepositPreviewBody,
  withdraw: WithdrawPreviewBody,
};

/**
 * Returns a preview body for the given write tool, or `null` if the tool
 * isn't covered (caller falls back to the single-line `inputSummary` text).
 *
 * Per-tool fee bps are sourced from `@t2000/sdk` (SAVE_FEE_BPS,
 * BORROW_FEE_BPS) — no override needed; the canonical fee values are
 * single-source-of-truth in the SDK constants.
 */
export function renderPreviewBody(
  toolName: string,
  input: Record<string, unknown>,
  options?: {
    borrowApyBps?: number;
    currentHF?: number | null;
    projectedHF?: number | null;
    ratesOverride?: { usdcApyBps?: number; usdsuiApyBps?: number };
  },
): ReactNode | null {
  const Body = PREVIEW_BODIES[toolName];
  if (!Body) {
    return null;
  }
  return (
    <Body
      borrowApyBps={options?.borrowApyBps}
      currentHF={options?.currentHF}
      input={input}
      projectedHF={options?.projectedHF}
      ratesOverride={options?.ratesOverride}
    />
  );
}

export const SUPPORTED_PREVIEW_TOOLS = Object.keys(PREVIEW_BODIES);
