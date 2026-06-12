"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
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
// [SPEC_AUDRIC_DEFI_REMOVAL §2a/§2d — 2026-06-10] The save_deposit /
// borrow / harvest_rewards bodies were deleted with their tools. The
// surviving withdraw + repay_debt bodies cover the 7-day exit grace
// window; delete this whole file at the post-window cut (neither
// withdraw nor repay charges a fee, and send_transfer / mpp_call never
// used PREVIEW_BODIES).
//
// usdValue=amount assumption: repay/withdraw assets are constrained to
// USDC | USDsui by the SDK allow-list. Both stables peg to ~$1, so
// `usdValue = amount` is correct.
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_USDC_APY_BPS = 462;
const DEFAULT_USDSUI_APY_BPS = 520;

const SECTION_LABEL =
  "font-mono text-[9px] text-muted-foreground tracking-[0.14em] uppercase";

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
    return "text-success";
  }
  if (hf < 1.1) {
    return "text-destructive";
  }
  if (hf < 1.5) {
    return "text-warning";
  }
  return "text-success";
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
            <span className="text-muted-foreground">{formatHF(healthFactor)}</span>
            <span className="px-1 text-muted-foreground">→</span>
            <span>{formatHF(projected ?? null)}</span>
          </>
        ) : (
          formatHF(healthFactor)
        )}
      </span>
    </div>
  );
}

interface PreviewBodyProps {
  borrowApyBps?: number;
  currentHF?: number | null;
  input: Record<string, unknown>;
  projectedHF?: number | null;
  ratesOverride?: { usdcApyBps?: number; usdsuiApyBps?: number };
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
        <div className="pt-1 text-[10px] text-muted-foreground italic">
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

// ─── Dispatcher ───────────────────────────────────────────────────────────

const PREVIEW_BODIES: Record<
  string,
  (props: PreviewBodyProps) => ReactNode
> = {
  // §2d grace window — delete with the post-window cut.
  repay_debt: RepayPreviewBody,
  withdraw: WithdrawPreviewBody,
};

/**
 * Returns a preview body for the given write tool, or `null` if the tool
 * isn't covered (caller falls back to the single-line `inputSummary` text).
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
