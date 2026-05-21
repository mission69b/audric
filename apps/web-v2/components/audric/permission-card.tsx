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
 *   - Timer reset on `attemptId` change (legacy SPEC 7 P2.4b audit fix
 *     — when a re-yield ships a fresh attemptId without unmount, rebase
 *     the countdown).
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

export interface PermissionCardProps {
  /** Free-form description sourced from `toolMetadata.description`. */
  description: string;
  /** Caller-controlled disable (e.g. "Approve" is in-flight). */
  disabled?: boolean;
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
  toolName: string;
}

const TIMEOUT_SEC = 60;

const TOOL_LABELS: Record<string, string> = {
  borrow: "Borrow",
  claim_rewards: "Claim rewards",
  harvest_rewards: "Harvest rewards",
  repay_debt: "Repay debt",
  save_deposit: "Save deposit",
  send_transfer: "Send transfer",
  swap_execute: "Swap",
  volo_stake: "Stake",
  volo_unstake: "Unstake",
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
  if (toolName === "volo_stake") {
    return `${input.amount ?? "?"} SUI → vSUI`;
  }
  if (toolName === "volo_unstake") {
    return input.amount === "all"
      ? "All vSUI → SUI"
      : `${input.amount ?? "?"} vSUI → SUI`;
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
    <label className="flex flex-col gap-1 text-muted-foreground text-xs">
      <span className="uppercase tracking-wide">
        {field.name}
        {field.asset ? ` (${field.asset})` : ""}
      </span>
      <input
        className="rounded-md border border-input bg-background px-3 py-2 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        disabled={disabled}
        inputMode={isAmount ? "decimal" : "text"}
        min={isAmount ? 0 : undefined}
        onChange={(e) => handleChange(e.target.value)}
        step={isAmount ? "any" : undefined}
        type={isAmount ? "number" : "text"}
        value={value}
      />
    </label>
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
  } = props;

  const label = TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");

  // Snapshot of the LLM-emitted input — used to seed `modifiedInput` and
  // to render the read-only preview body when no field is modified.
  const initialInput = useMemo<Record<string, unknown>>(
    () => ({ ...input }),
    [input]
  );

  const [modifiedInput, setModifiedInput] =
    useState<Record<string, unknown>>(initialInput);
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SEC);
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
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Fire async deny without awaiting in the interval callback —
          // the deny handler owns its own in-flight state.
          handleDenyRef.current().catch((err) => {
            console.error("[permission-card] timeout deny failed:", err);
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [resolved]);

  // Amount-field validation gate — Approve is disabled when any
  // amount-kind modifiable field is empty / NaN / non-positive.
  const isApproveDisabled = useMemo(() => {
    if (disabled === true || inFlight || resolved) {
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
  }, [disabled, inFlight, resolved, modifiableFields, modifiedInput]);

  const progress = secondsLeft / TIMEOUT_SEC;

  // Pick the rich preview body for known write tools; fall back to the
  // single-line `formatInput` summary otherwise. The body re-renders
  // when `modifiedInput` changes so the user sees their edits reflected
  // before approving (e.g. amount updates flow into the USD value).
  const previewBody = renderPreviewBody(toolName, modifiedInput);
  const inputSummary =
    previewBody === null ? formatInput(modifiedInput, toolName) : null;

  return (
    <div className="my-3 space-y-2.5 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">{label}</div>
        {!resolved && (
          <span
            aria-label={`${secondsLeft} seconds remaining`}
            className={`font-mono text-[10px] tabular-nums ${
              secondsLeft <= 10 ? "text-error-solid" : "text-muted-foreground"
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

      {description && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}

      {previewBody}
      {inputSummary && (
        <p className="font-mono text-foreground text-sm">{inputSummary}</p>
      )}

      {!resolved && modifiableFields.length > 0 && (
        <div className="space-y-2 rounded-md border border-border bg-background p-2">
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

      {errorMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive text-xs">
          {errorMessage}
        </div>
      )}

      {!resolved && (
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={disabled === true || inFlight}
            onClick={() => {
              handleDeny().catch((err) => {
                console.error("[permission-card] deny failed:", err);
              });
            }}
            variant="outline"
          >
            Deny
          </Button>
          <Button
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
  if (toolName === "volo_stake") {
    return `Stake ${input.amount ?? "?"} SUI`;
  }
  if (toolName === "volo_unstake") {
    return input.amount === "all"
      ? "Unstake all vSUI"
      : `Unstake ${input.amount ?? "?"} vSUI`;
  }
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
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          handleDenyRef.current().catch((err) => {
            console.error("[bundle-permission-card] timeout deny failed:", err);
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [resolved]);

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
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
              ATOMIC · {bundleAsset}
            </span>
          )}
        </div>
        {!resolved && (
          <span
            aria-label={`${secondsLeft} seconds remaining`}
            className={`font-mono text-[10px] tabular-nums ${
              secondsLeft <= 10 ? "text-error-solid" : "text-muted-foreground"
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
        <div className="flex items-center justify-end gap-2">
          <Button
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
