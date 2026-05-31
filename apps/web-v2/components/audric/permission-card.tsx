"use client";

/**
 * PermissionCard — confirm UI for AI-SDK-HITL-paused write tools.
 *
 * Renders inside the chat message stream when a tool part is in state
 * `'approval-requested'` (AI SDK v6 native HITL flow per Phase 3 D-8).
 *
 * Phase 5d extension (S.182): the canary scope (Phase 3 Day 3c) handled
 * only `save_deposit` with a single editable `amount` field. Phase 5d
 * extends the SAME component (per Surgical Changes + V1/V2 consolidation
 * lock) to single-write parity with the legacy `apps/web` PermissionCard:
 *
 *   - 60s deny-timer + progress bar; auto-fires `onDeny()` on timeout.
 *   - Multi-field modifiable inputs (any field in `modifiableFields`,
 *     not just `amount`). Generalises the legacy v1.4 Item 6 contract.
 *   - Tool label resolver (TOOL_LABELS map → human-readable header).
 *   - Per-tool rich preview body via `renderPreviewBody()` —
 *     `save_deposit` / `withdraw` / `borrow` / `repay_debt` /
 *     `harvest_rewards` get the AssetAmountBlock + APYBlock + FeeRow +
 *     HFRow ledger view; everything else falls back to
 *     `formatInput()` single-line summary.
 *   - Timer reset on re-yield: the host keys this card on the
 *     pending-action `approvalId` (`audric-chat-client.tsx`), so a fresh
 *     yield remounts the card and rebases the countdown + edited-input
 *     state. (The card itself holds no `approvalId` prop — the reset is
 *     structural via the React key, not an in-component effect.)
 *
 * Phase 5d intentionally DEFERS (each requires upstream chat-route
 * plumbing that isn't gated by this slice):
 *
 *   - Guard-injection display — needs pre-approval guards in the chat
 *     route. v0.7c `Experimental_Agent` wraps guards inside `execute()`
 *     today, post-approval; pre-approval surfacing is a follow-on slice.
 *   - SendAddressBlock (saved-contact + near-contact + self-send +
 *     address-from-message badges) — needs `contacts` list threaded
 *     into `toolMetadata` from the chat route.
 *   - Quote-refresh button + age badge — no `regenerated` event in
 *     v0.7c engine wire format (S.181 lock).
 *   - WorkingState transition after approve — motion family DELETED
 *     (S.180); the `inFlight` state's "Confirming…" button copy carries
 *     the signal instead.
 *
 * Phase 5e extension (S.183): adds `BundlePermissionCard` for multi-
 * write atomic Payment Intents. Architecturally a sibling to
 * `PermissionCard` — same approve/deny gesture model, same 60s deny-
 * timer, but renders a steps list (one row per write) and the parent
 * fans out N `addToolApprovalResponse` + 1 `sponsoredTx({type:'bundle'})`
 * + N `addToolOutput` on the single approve gesture. The chat route's
 * `data-audric-bundle` marker decides bundle vs single — see
 * `app/(chat)/api/audric-chat/route.ts` `BundleBuffer`.
 *
 * Phase 5e MVP intentionally DEFERS:
 *   - Per-step modifiable inputs — bundle steps' `modifiableFields` are
 *     present on the wire but editing N independent fields requires
 *     per-step `modifiedInput` state + per-step validation gates.
 *     Approve uses the LLM-emitted input verbatim. Single-write
 *     modifiable editing (Phase 5d) still works as before.
 *   - Cluster rendering (legacy `clusterBundleSteps`) — collapses
 *     adjacent `swap_execute → save_deposit` pairs into one row.
 *     Skipping keeps the renderer one-row-per-step (easier to read at
 *     MVP; legacy's clustering is a SPEC 23A polish layer that lands
 *     when Audric Finance's swap-and-save chip flow goes live).
 *
 * The component is "dumb" — all side effects (sponsored-tx flow,
 * `addToolOutput` / `addToolApprovalResponse` calls) happen in the
 * parent `audric-chat-client.tsx`, which passes typed callbacks here.
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 5d" + S.182 (single-
 * write), §"Phase 5e" + S.183 (bundles).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { renderPreviewBody } from "./cards/preview-bodies";

export interface PermissionCardModifiableField {
  asset?: string;
  kind: string;
  name: string;
}

/**
 * [R6.4 A2] Pre-approval guard surfaced on the card (phase2-permission-
 * card.html states 04 HINT / 05 BLOCK). `hint` = amber, non-blocking
 * (the user can still approve); `block` = red, disables Approve. Mirrors
 * the engine `guards.ts` outcomes (`{pass:true,warning}` → hint,
 * `{pass:false,reason}` → block).
 *
 * OPTIONAL + dormant: the chat route does NOT yet thread
 * `guardInjections` into `toolMetadata` (deferred backend slice — see
 * `parseAudricMetadata`). The card renders nothing when the prop is
 * absent/empty, so wiring the strip now is zero-regression and ready
 * for the day guards are plumbed.
 */
export interface PermissionCardGuard {
  kind: "hint" | "block";
  message: string;
}

export interface PermissionCardProps {
  /**
   * [P5.6] Live borrow APY in basis points (e.g. `467` = 4.67%) sourced
   * from `toolMetadata.borrowApyBps`. Lights up the APY row in the
   * `borrow` / `repay_debt` preview bodies; `undefined` falls back to
   * the "Variable rate — locked at execute time" disclaimer.
   */
  borrowApyBps?: number;
  /**
   * [P5.6] Current health factor BEFORE the pending write executes
   * sourced from `toolMetadata.currentHF`. `number` = finite HF, `null`
   * = ∞ (no debt), `undefined` = data unavailable (row hides entirely
   * in preview bodies).
   */
  currentHF?: number | null;
  /**
   * [R6.4 A2] Deny-timer length in seconds (default 60). Parameterises
   * the legacy magic constant; the dev harness passes a large value to
   * hold the card in its await-state for screenshot-diffing. Production
   * omits it.
   */
  denyTimeoutSec?: number;
  /** Free-form description sourced from `toolMetadata.description`. */
  description: string;
  /** Caller-controlled disable (e.g. "Approve" is in-flight). */
  disabled?: boolean;
  /**
   * [R6.4 A2] Pre-approval guard strips (phase2 states 04 HINT / 05
   * BLOCK). Any `block` guard disables Approve. Optional + dormant
   * until `guardInjections` is plumbed through the chat route.
   */
  guards?: readonly PermissionCardGuard[];
  /** Tool input as emitted by the LLM (e.g. `{ amount: 0.01, asset: 'USDC' }`). */
  input: Record<string, unknown>;
  /** From `toolMetadata.modifiableFields` — drives which inputs are editable. */
  modifiableFields: readonly PermissionCardModifiableField[];
  /**
   * Callback invoked when the user taps "Approve". Receives the
   * (possibly user-edited) input — the parent flows this through the
   * sponsored-tx flow then `addToolOutput`.
   */
  onApprove: (modifiedInput: Record<string, unknown>) => Promise<void> | void;
  /** Callback invoked when the user taps "Deny" or the deny-timer expires. */
  onDeny: () => Promise<void> | void;
  /**
   * [P5.6] Projected HF AFTER the pending write executes sourced from
   * `toolMetadata.projectedHF`. Same semantics as `currentHF`. When
   * paired with `currentHF`, the preview body renders "current →
   * projected" so the user sees the HF impact before approving.
   */
  projectedHF?: number | null;
  toolName: string;
}

const TIMEOUT_SEC = 60;

// [R6.4 A2] 3-tier freshness chrome (phase2-permission-card.html):
// ok (white) → warn (amber, ≤20s) → err (red, ≤10s).
const TIER_PILL_CLASS = {
  ok: "border-border bg-muted text-muted-foreground",
  warn: "border-warning/30 bg-warning/[0.08] text-warning",
  err: "border-destructive/30 bg-destructive/[0.08] text-destructive",
} as const;
const TIER_BAR_CLASS = {
  ok: "bg-foreground",
  warn: "bg-warning",
  err: "bg-destructive",
} as const;

const TOOL_LABELS: Record<string, string> = {
  borrow: "Borrow",
  claim_rewards: "Claim rewards",
  harvest_rewards: "Harvest rewards",
  repay_debt: "Repay debt",
  save_deposit: "Save deposit",
  send_transfer: "Send transfer",
  swap_execute: "Swap",
  withdraw: "Withdraw",
};

// Coin-type → symbol resolver used by `formatInput` for `swap_execute`
// (the engine emits raw coin types on the `from`/`to` keys; legacy
// PermissionCard mirrors the same map). Mirrors the audric-side
// `COIN_TYPE_SYMBOLS` table; if a new asset lands in the SDK allow-list
// without an entry here, `resolveSymbol` falls back to the raw string.
const COIN_TYPE_SYMBOLS: Record<string, string> = {
  "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS":
    "CETUS",
  "0x2::sui::SUI": "SUI",
  "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL":
    "WAL",
  "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT":
    "USDT",
  "0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT":
    "vSUI",
  "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX":
    "NAVX",
  "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH":
    "ETH",
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC":
    "USDC",
  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP":
    "DEEP",
};

function resolveSymbol(nameOrType: unknown): string {
  const s = String(nameOrType ?? "?");
  if (COIN_TYPE_SYMBOLS[s]) {
    return COIN_TYPE_SYMBOLS[s];
  }
  // Truncate raw coin types to keep the summary line readable.
  if (s.startsWith("0x") && s.length > 16) {
    return `${s.slice(0, 10)}…`;
  }
  return s;
}

/**
 * Single-line text fallback for tools without a registered preview
 * body. Mirrors `apps/web` legacy `formatInput()` — same heuristics so
 * the v0.7c surface narrates identically.
 */
function formatInput(
  input: Record<string, unknown>,
  toolName: string
): string | null {
  if (toolName === "swap_execute") {
    const from = resolveSymbol(input.from);
    const to = resolveSymbol(input.to);
    const amt = input.amount ?? "?";
    return `${amt} ${from} → ${to}`;
  }

  const parts: string[] = [];
  if (input.amount !== undefined && input.amount !== null) {
    parts.push(`$${input.amount}`);
  }
  if (typeof input.asset === "string") {
    parts.push(input.asset);
  }
  // For `send_transfer` the full chunked-hex address is rendered
  // separately (when SendAddressBlock lands in a follow-on slice). For
  // now we leave the address out of the text summary so users don't
  // verify against a truncated string.
  if (toolName !== "send_transfer") {
    if (typeof input.to === "string") {
      parts.push(`To: ${input.to.slice(0, 8)}…`);
    }
    if (typeof input.recipient === "string") {
      parts.push(`To: ${input.recipient.slice(0, 8)}…`);
    }
  }
  if (typeof input.url === "string") {
    parts.push(input.url.replace("https://mpp.t2000.ai/", ""));
  }
  if (input.maxPrice !== undefined && input.maxPrice !== null) {
    parts.push(`max $${input.maxPrice}`);
  }
  if (typeof input.memo === "string") {
    parts.push(`"${input.memo}"`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

interface ModifiableFieldInputProps {
  disabled: boolean;
  field: PermissionCardModifiableField;
  initialValue: unknown;
  onChange: (name: string, value: string | number) => void;
}

function ModifiableFieldInput({
  field,
  initialValue,
  onChange,
  disabled,
}: ModifiableFieldInputProps) {
  const initialString =
    initialValue === undefined || initialValue === null
      ? ""
      : String(initialValue);
  const [value, setValue] = useState<string>(initialString);
  const isAmount = field.kind === "amount";

  function handleChange(next: string) {
    setValue(next);
    if (isAmount) {
      const num = Number(next);
      onChange(field.name, Number.isFinite(num) ? num : next);
    } else {
      onChange(field.name, next);
    }
  }

  return (
    <label className="flex items-center gap-2.5 rounded-lg border border-border bg-muted px-3.5 py-2.5">
      <span className="w-20 shrink-0 text-[13px] text-muted-foreground">
        {field.name}
        {field.asset ? ` (${field.asset})` : ""}
      </span>
      <input
        className="min-w-0 flex-1 appearance-none border-0 bg-transparent font-mono text-[13.5px] text-foreground tabular-nums outline-none disabled:opacity-50"
        disabled={disabled}
        inputMode={isAmount ? "decimal" : "text"}
        min={isAmount ? 0 : undefined}
        onChange={(e) => handleChange(e.target.value)}
        step={isAmount ? "any" : undefined}
        type={isAmount ? "number" : "text"}
        value={value}
      />
      <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground uppercase tracking-[0.06em]">
        Edit
      </span>
    </label>
  );
}

// [R6.4 A2] Guard strip — phase2 states 04 HINT (amber) / 05 BLOCK (red).
function GuardBanner({ guard }: { guard: PermissionCardGuard }) {
  const isBlock = guard.kind === "block";
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-[11px] text-[13px] leading-[1.5] ${
        isBlock
          ? "border-destructive/30 bg-destructive/[0.06] text-destructive"
          : "border-warning/30 bg-warning/[0.06] text-warning"
      }`}
    >
      <span
        aria-hidden="true"
        className="mt-px shrink-0 font-mono font-semibold text-sm"
      >
        {isBlock ? "✕" : "!"}
      </span>
      <span>{guard.message}</span>
    </div>
  );
}

export function PermissionCard(props: PermissionCardProps) {
  const {
    toolName,
    description,
    input,
    modifiableFields,
    onApprove,
    onDeny,
    disabled,
    guards,
    denyTimeoutSec,
    borrowApyBps,
    currentHF,
    projectedHF,
  } = props;

  const timeoutSec = denyTimeoutSec ?? TIMEOUT_SEC;

  const label = TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
  const eyebrowAsset =
    typeof input.asset === "string" ? input.asset.toUpperCase() : null;
  const eyebrow = eyebrowAsset
    ? `${label.toUpperCase()} · ${eyebrowAsset}`
    : label.toUpperCase();

  // Snapshot of the LLM-emitted input — used to seed `modifiedInput` and
  // to render the read-only preview body when no field is modified.
  const initialInput = useMemo<Record<string, unknown>>(
    () => ({ ...input }),
    [input]
  );

  const [modifiedInput, setModifiedInput] =
    useState<Record<string, unknown>>(initialInput);
  const [secondsLeft, setSecondsLeft] = useState(timeoutSec);
  const [inFlight, setInFlight] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const resolvedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleFieldChange(name: string, value: string | number) {
    setModifiedInput((prev) => ({ ...prev, [name]: value }));
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function handleApprove() {
    if (resolvedRef.current) {
      return;
    }
    resolvedRef.current = true;
    setResolved(true);
    stopTimer();
    setErrorMessage(null);
    setInFlight(true);
    try {
      await onApprove(modifiedInput);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      // Unwind the resolved state so the user can retry (mirrors the
      // legacy contract: a thrown approve does NOT lock the card).
      resolvedRef.current = false;
      setResolved(false);
    } finally {
      setInFlight(false);
    }
  }

  async function handleDeny() {
    if (resolvedRef.current) {
      return;
    }
    resolvedRef.current = true;
    setResolved(true);
    stopTimer();
    setErrorMessage(null);
    setInFlight(true);
    try {
      await onDeny();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setInFlight(false);
    }
  }

  // 60s deny-timer. Mirrors legacy `apps/web` `PermissionCard.tsx`
  // — 1s tick, auto-fires `onDeny()` at 0. Cleanup on unmount.
  //
  // We stash `handleDeny` in a ref so the interval body always invokes
  // the latest handler without forcing the effect to re-subscribe on
  // every render (which would reset the timer each tick).
  const handleDenyRef = useRef(handleDeny);
  handleDenyRef.current = handleDeny;
  useEffect(() => {
    if (resolved) {
      return;
    }
    timerRef.current = setInterval(() => {
      // [F1 — 2026-05-31] The updater MUST stay pure — only decrement.
      // Previously this fired `handleDenyRef.current()` from inside the
      // `setSecondsLeft` updater, which calls the parent's
      // `addToolApprovalResponse`/`addToolOutput` (setState on
      // AudricChatPanel) DURING this component's render phase → React
      // "Cannot update a component while rendering a different component"
      // warning. Expiry is now handled in the effect below, post-commit.
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [resolved]);

  // [F1 — 2026-05-31] Fire the auto-deny in a post-commit effect once the
  // countdown reaches 0 (not inside the render-phase state updater above).
  useEffect(() => {
    if (secondsLeft === 0 && !resolvedRef.current) {
      handleDenyRef.current().catch((err) => {
        console.error("[permission-card] timeout deny failed:", err);
      });
    }
  }, [secondsLeft]);

  // [R6.4 A2] A `block`-tier guard hard-disables Approve (phase2 state 05).
  const hasBlockingGuard = useMemo(
    () => (guards ?? []).some((g) => g.kind === "block"),
    [guards]
  );

  // Amount-field validation gate — Approve is disabled when any
  // amount-kind modifiable field is empty / NaN / non-positive.
  const isApproveDisabled = useMemo(() => {
    if (disabled === true || inFlight || resolved || hasBlockingGuard) {
      return true;
    }
    for (const field of modifiableFields) {
      if (field.kind !== "amount") {
        continue;
      }
      const value = modifiedInput[field.name];
      if (typeof value === "number") {
        if (!Number.isFinite(value) || value <= 0) {
          return true;
        }
      } else if (typeof value === "string") {
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0 || value.trim().length === 0) {
          return true;
        }
      } else {
        return true;
      }
    }
    return false;
  }, [
    disabled,
    inFlight,
    resolved,
    hasBlockingGuard,
    modifiableFields,
    modifiedInput,
  ]);

  const progress = secondsLeft / timeoutSec;
  let timerTier: "ok" | "warn" | "err" = "ok";
  if (secondsLeft <= 10) {
    timerTier = "err";
  } else if (secondsLeft <= 20) {
    timerTier = "warn";
  }

  // Pick the rich preview body for known write tools; fall back to the
  // single-line `formatInput` summary otherwise. The body re-renders
  // when `modifiedInput` changes so the user sees their edits reflected
  // before approving (e.g. amount updates flow into the USD value).
  //
  // [P5.6] HF/APY threaded into the preview-body options so the rich
  // rows (HFRow current→projected, APYRow) light up automatically when
  // metadata is available. Unavailable fields degrade row-by-row.
  const previewBody = renderPreviewBody(toolName, modifiedInput, {
    borrowApyBps,
    currentHF,
    projectedHF,
  });
  const inputSummary =
    previewBody === null ? formatInput(modifiedInput, toolName) : null;

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
      <div className="px-5 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium text-[15.5px] text-foreground tracking-[-0.014em]">
              {label}
            </h3>
            <span className="mt-1.5 block font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
              {eyebrow}
            </span>
          </div>
          {!resolved && (
            <span
              aria-label={`${secondsLeft} seconds remaining`}
              className={`whitespace-nowrap rounded border px-[9px] py-[3px] font-mono text-[11px] tabular-nums ${TIER_PILL_CLASS[timerTier]}`}
              role="timer"
            >
              {secondsLeft}s
            </span>
          )}
        </div>

        {!resolved && (
          <div className="mt-4 h-0.5 w-full overflow-hidden bg-border">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${TIER_BAR_CLASS[timerTier]}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="space-y-3 px-5 pt-[18px] pb-3">
        {description && !inFlight && (
          <p className="text-[13.5px] text-muted-foreground leading-[1.55]">
            {description}
          </p>
        )}

        {/* [R6.4 A2] SIGNING (phase2 state 06) — spinner + Passport copy. */}
        {inFlight && (
          <p className="flex items-center gap-2.5 text-[13.5px] text-foreground leading-[1.55]">
            <span
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
            />
            Confirming with your Passport…
          </p>
        )}

        <div className={inFlight ? "opacity-70" : undefined}>
          {previewBody}
          {inputSummary && (
            <p className="font-mono text-foreground text-sm">{inputSummary}</p>
          )}
        </div>

        {!resolved && modifiableFields.length > 0 && (
          <div className="space-y-1.5">
            {modifiableFields.map((field) => (
              <ModifiableFieldInput
                disabled={disabled === true || inFlight}
                field={field}
                initialValue={initialInput[field.name]}
                key={field.name}
                onChange={handleFieldChange}
              />
            ))}
          </div>
        )}

        {/* [R6.4 A2] Guard strips — phase2 states 04 HINT / 05 BLOCK. */}
        {guards && guards.length > 0 && (
          <div className="space-y-1.5">
            {guards.map((guard) => (
              <GuardBanner
                guard={guard}
                key={`${guard.kind}-${guard.message.slice(0, 24)}`}
              />
            ))}
          </div>
        )}

        {errorMessage && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive text-xs">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-border border-t px-5 py-3 font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true">⚡</span>
          Gas · Sponsored
        </span>
        <span>You decide</span>
      </div>

      {!resolved && (
        <div className="flex flex-col gap-2 px-5 pt-3.5 pb-[18px] sm:flex-row sm:items-center sm:justify-end">
          <Button
            className="h-[46px] w-full sm:h-9 sm:w-auto"
            disabled={disabled === true || inFlight}
            onClick={() => {
              handleDeny().catch((err) => {
                console.error("[permission-card] deny failed:", err);
              });
            }}
            variant="ghost"
          >
            Deny
          </Button>
          <Button
            className="h-[46px] w-full sm:h-9 sm:w-auto"
            disabled={isApproveDisabled}
            onClick={() => {
              handleApprove().catch((err) => {
                console.error("[permission-card] approve failed:", err);
              });
            }}
            variant="default"
          >
            {inFlight ? "Confirming…" : "Approve"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// [Phase 5e — S.183] BundlePermissionCard — multi-write atomic Payment
// Intent renderer. One card per `data-audric-bundle` marker; one
// approve gesture maps to N `addToolApprovalResponse` + 1 sponsored-tx
// (atomic PTB) + N `addToolOutput` in the parent.
// ---------------------------------------------------------------------------

export interface BundlePermissionCardStep {
  /** AI SDK identity — used by parent for `addToolApprovalResponse` fan-out. */
  approvalId: string;
  /** Per-step user-facing summary from engine `describeAction`. */
  description: string;
  /** LLM-emitted input. Read-only in MVP (per-step editing deferred). */
  input: Record<string, unknown>;
  /** Mirrors single-write field; unused in MVP but threaded for future. */
  modifiableFields: readonly PermissionCardModifiableField[];
  /** AI SDK identity — used by parent for `addToolOutput` fan-out. */
  toolCallId: string;
  /** Engine tool name (`save_deposit` / `swap_execute` / etc.). */
  toolName: string;
}

export interface BundlePermissionCardProps {
  /** Caller-controlled disable (e.g. another bundle is in-flight). */
  disabled?: boolean;
  /**
   * Approve callback. Receives the original steps array. The parent is
   * responsible for: (1) calling `addToolApprovalResponse({approved:true})`
   * for every step's `approvalId`, (2) dispatching ONE sponsored
   * bundle tx, (3) calling `addToolOutput` for every step's
   * `toolCallId` with the proportional result.
   */
  onApprove: (
    steps: readonly BundlePermissionCardStep[]
  ) => Promise<void> | void;
  /**
   * Deny callback. The parent fans out N `addToolApprovalResponse
   * ({approved:false})` + N `addToolOutput({state:'output-error'})`.
   */
  onDeny: (steps: readonly BundlePermissionCardStep[]) => Promise<void> | void;
  /** All bundle steps in their LLM-emission order. ≥2 by construction. */
  steps: readonly BundlePermissionCardStep[];
}

/**
 * [Phase 5e] Pick the dominant asset for the bundle subtitle. Mirrors
 * legacy `primaryBundleAsset` — returns the single asset symbol when
 * every step touches the same one, falls back to "USDC" when the
 * bundle mixes assets that include USDC (the canonical stable), `null`
 * otherwise (subtitle omitted by the renderer).
 */
function primaryBundleAsset(
  steps: readonly BundlePermissionCardStep[]
): string | null {
  const symbols = new Set<string>();
  for (const step of steps) {
    const input = step.input;
    if (typeof input.asset === "string") {
      symbols.add(input.asset);
    }
    if (step.toolName === "swap_execute" && typeof input.from === "string") {
      symbols.add(resolveSymbol(input.from));
    }
  }
  if (symbols.size === 1) {
    return Array.from(symbols)[0] ?? null;
  }
  if (symbols.has("USDC")) {
    return "USDC";
  }
  return null;
}

/**
 * [Phase 5e] One-line summary per step. Mirrors legacy
 * `bundleStepSummary`. Short form — the renderer's row is compact.
 */
function bundleStepSummary(step: BundlePermissionCardStep): string {
  const { toolName, input } = step;
  const label = TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
  if (toolName === "swap_execute") {
    const from = resolveSymbol(input.from);
    const to = resolveSymbol(input.to);
    const amt = input.amount ?? "?";
    return `Swap ${amt} ${from} → ${to}`;
  }
  if (toolName === "send_transfer") {
    const amt = input.amount ?? "?";
    const asset = typeof input.asset === "string" ? input.asset : "USDC";
    return `Send ${amt} ${asset}`;
  }
  // [S.277] volo_stake / volo_unstake branches removed — engine tools
  // cut in 2.18.0 ("Earns Its Keep" audit).
  // Default: "<Label> <amount> <asset>". Covers save / borrow / repay /
  // withdraw / claim / harvest naturally.
  const amt = input.amount;
  const asset = typeof input.asset === "string" ? input.asset : "USDC";
  if (amt !== undefined && amt !== null) {
    return `${label} ${amt} ${asset}`;
  }
  return label;
}

export function BundlePermissionCard(props: BundlePermissionCardProps) {
  const { steps, onApprove, onDeny, disabled } = props;

  const stepCount = steps.length;
  const bundleAsset = primaryBundleAsset(steps);

  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SEC);
  const [inFlight, setInFlight] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const resolvedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function handleApprove() {
    if (resolvedRef.current) {
      return;
    }
    resolvedRef.current = true;
    setResolved(true);
    stopTimer();
    setErrorMessage(null);
    setInFlight(true);
    try {
      await onApprove(steps);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      // Allow retry — match single-write contract.
      resolvedRef.current = false;
      setResolved(false);
    } finally {
      setInFlight(false);
    }
  }

  async function handleDeny() {
    if (resolvedRef.current) {
      return;
    }
    resolvedRef.current = true;
    setResolved(true);
    stopTimer();
    setErrorMessage(null);
    setInFlight(true);
    try {
      await onDeny(steps);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setInFlight(false);
    }
  }

  // 60s deny-timer — same pattern as single-write `PermissionCard`.
  const handleDenyRef = useRef(handleDeny);
  handleDenyRef.current = handleDeny;
  useEffect(() => {
    if (resolved) {
      return;
    }
    timerRef.current = setInterval(() => {
      // [F1 — 2026-05-31] Pure updater — expiry side effect lives in the
      // post-commit effect below (see single-write card for rationale).
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [resolved]);

  // [F1 — 2026-05-31] Auto-deny on expiry, post-commit.
  useEffect(() => {
    if (secondsLeft === 0 && !resolvedRef.current) {
      handleDenyRef.current().catch((err) => {
        console.error("[bundle-permission-card] timeout deny failed:", err);
      });
    }
  }, [secondsLeft]);

  const progress = secondsLeft / TIMEOUT_SEC;

  return (
    <div
      aria-label={`Confirm ${stepCount}-step Payment Intent`}
      className="my-3 space-y-2.5 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm"
      role="alertdialog"
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground text-sm">
            {stepCount} operations · 1 Payment Intent · Atomic
          </span>
          {bundleAsset && (
            <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
              ATOMIC · {bundleAsset}
            </span>
          )}
        </div>
        {!resolved && (
          <span
            aria-label={`${secondsLeft} seconds remaining`}
            className={`whitespace-nowrap rounded border px-[9px] py-[3px] font-mono text-[11px] tabular-nums ${
              secondsLeft <= 10
                ? "border-destructive/30 bg-destructive/[0.08] text-destructive"
                : "border-border bg-muted text-muted-foreground"
            }`}
            role="timer"
          >
            {secondsLeft}s
          </span>
        )}
      </div>

      {!resolved && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Approve {stepCount} operations as one atomic transaction.
      </p>

      <div className="divide-y divide-border rounded-md border border-border bg-background">
        {steps.map((step, idx) => (
          <div
            className="flex items-center gap-3 px-3 py-2.5"
            key={step.toolCallId}
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground font-mono font-semibold text-[10px] text-background">
              {idx + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-foreground text-[13px]">
                {bundleStepSummary(step)}
              </div>
              {step.description &&
                step.description !== bundleStepSummary(step) && (
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {step.description}
                  </div>
                )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
        <span className="flex items-center gap-1">
          <span aria-hidden="true">⚡</span>
          GAS · SPONSORED
        </span>
        <span>ALL SUCCEED OR ALL REVERT</span>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive text-xs">
          {errorMessage}
        </div>
      )}

      {!resolved && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            className="h-[46px] w-full sm:h-9 sm:w-auto"
            disabled={disabled === true || inFlight}
            onClick={() => {
              handleDeny().catch((err) => {
                console.error("[bundle-permission-card] deny failed:", err);
              });
            }}
            variant="outline"
          >
            Deny
          </Button>
          <Button
            className="h-[46px] w-full sm:h-9 sm:w-auto"
            disabled={disabled === true || inFlight || resolved}
            onClick={() => {
              handleApprove().catch((err) => {
                console.error("[bundle-permission-card] approve failed:", err);
              });
            }}
            variant="default"
          >
            {inFlight ? "Confirming…" : `Approve ${stepCount} ops`}
          </Button>
        </div>
      )}
    </div>
  );
}
