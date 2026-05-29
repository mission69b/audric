"use client";

/**
 * Username picker — port from `apps/web/components/identity/UsernamePicker.tsx`.
 *
 * Two diffs from legacy:
 *   - Icon usage swapped for lucide-react equivalents (check / close /
 *     spinner / sparkle → CheckIcon / XIcon / LoaderIcon / SparklesIcon)
 *   - lib helpers (validateAudricLabel, suggestUsernames) cross-app-imported
 *     from `apps/web/lib/identity/*`
 *
 * UX parity: 540px sunken card, mono `// PASSPORT / HANDLE` header strip,
 * serif "Pick your handle" hero, suggestion table with debounced live
 * availability, free-text input with `@`-prefix + `@audric` suffix,
 * dither rule, skip/claim footer.
 */

import { CheckIcon, LoaderIcon, SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchIdentityCheck } from "@/lib/identity/check-fetcher";
import { suggestUsernames } from "@/lib/identity/suggest-usernames";
import {
  type LabelReason,
  validateAudricLabel,
} from "@/lib/identity/validate-label";

const PARENT_SUFFIX = "@audric";
const DEBOUNCE_MS = 300;
const DITHER_PATTERN =
  "░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░";

export type UsernameCheckStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "reserved"
  | "invalid"
  | "too-short"
  | "too-long"
  | "verifier-down"
  | "error";

export interface UsernameCheckResult {
  available: boolean;
  reason?: LabelReason | "reserved" | "taken";
  verifierDown?: boolean;
}

export interface UsernamePickerProps {
  checkFetcher?: (label: string) => Promise<UsernameCheckResult>;
  disabled?: boolean;
  googleEmail?: string | null;
  googleName?: string | null;
  onSkip?: () => void;
  onSubmit: (label: string) => void;
}

async function defaultCheckFetcher(
  label: string
): Promise<UsernameCheckResult> {
  const r = await fetchIdentityCheck(label);
  return {
    available: r.available,
    reason: r.reason as UsernameCheckResult["reason"],
    verifierDown: r.verifierDown,
  };
}

export function UsernamePicker({
  googleName,
  googleEmail,
  onSubmit,
  onSkip,
  disabled = false,
  checkFetcher = defaultCheckFetcher,
}: UsernamePickerProps) {
  const [seed, setSeed] = useState(0);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<UsernameCheckStatus>("idle");
  const [rowStatus, setRowStatus] = useState<
    Record<string, UsernameCheckStatus>
  >({});
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(
    () => suggestUsernames({ googleName, googleEmail, seed, count: 3 }),
    [googleName, googleEmail, seed]
  );

  useEffect(() => {
    if (suggestions.length === 0) {
      setRowStatus({});
      return;
    }

    let cancelled = false;
    const initial: Record<string, UsernameCheckStatus> = {};
    for (const s of suggestions) {
      initial[s] = "checking";
    }
    setRowStatus(initial);

    Promise.all(
      suggestions.map((label) =>
        checkFetcher(label)
          .then((r) => ({ label, status: resultToStatus(r) }))
          .catch(() => ({ label, status: "error" as UsernameCheckStatus }))
      )
    ).then((results) => {
      if (cancelled) {
        return;
      }
      setRowStatus((prev) => {
        const next = { ...prev };
        for (const { label, status: s } of results) {
          next[label] = s;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [suggestions, checkFetcher]);

  const checkIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifiedFromRowRef = useRef<string | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (input === "") {
      setStatus("idle");
      return;
    }

    if (verifiedFromRowRef.current === input) {
      return;
    }

    const validation = validateAudricLabel(input);
    if (!validation.valid) {
      setStatus(validation.reason);
      return;
    }

    setStatus("checking");
    checkIdRef.current += 1;
    const id = checkIdRef.current;

    debounceTimerRef.current = setTimeout(() => {
      checkFetcher(validation.label)
        .then((r) => {
          if (checkIdRef.current !== id) {
            return;
          }
          setStatus(resultToStatus(r));
        })
        .catch(() => {
          if (checkIdRef.current !== id) {
            return;
          }
          setStatus("error");
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [input, checkFetcher]);

  const handleRowClick = useCallback(
    (label: string) => {
      const s = rowStatus[label];
      if (s === "available") {
        verifiedFromRowRef.current = label;
        setInput(label);
        checkIdRef.current += 1;
        setStatus("available");
      }
    },
    [rowStatus]
  );

  const handleRegenerate = useCallback(() => {
    setSeed((prev) => prev + 1);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (status !== "available") {
        return;
      }
      const validation = validateAudricLabel(input);
      if (!validation.valid) {
        return;
      }
      onSubmit(validation.label);
    },
    [input, status, onSubmit]
  );

  const submitLabel = disabled ? "Claiming…" : "CLAIM HANDLE →";
  const canSubmit = status === "available" && !disabled;

  const inputBorderClass = (() => {
    if (
      status === "taken" ||
      status === "invalid" ||
      status === "too-long" ||
      status === "reserved"
    ) {
      return "border-destructive/30";
    }
    if (status === "available") {
      return "border-success/30";
    }
    if (focused) {
      return "border-ring";
    }
    return "border-border";
  })();
  const inputShadow = focused
    ? status === "taken" ||
      status === "invalid" ||
      status === "too-long" ||
      status === "reserved"
      ? "shadow-[0_0_0_3px_rgba(213,11,11,0.18)]"
      : status === "available"
        ? "shadow-[0_0_0_3px_rgba(60,193,78,0.18)]"
        : "shadow-[var(--shadow-focus-ring)]"
    : "";

  return (
    <div
      className="rounded-lg border border-border bg-card px-7 pt-6 pb-6"
      data-testid="username-picker"
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">
          {"// PASSPORT / HANDLE"}
        </span>
      </div>

      <div className="mt-[22px] mb-[22px]">
        <h2 className="m-0 font-serif text-[36px] font-medium leading-[42px] tracking-[-0.01em] text-foreground">
          Pick your handle
        </h2>
        <p className="mt-[10px] mb-0 max-w-[460px] text-[14px] leading-[20px] text-muted-foreground">
          This is your forever Audric Passport — friends send you USDC by typing{" "}
          <code className="rounded-xs border border-border bg-muted px-[5px] py-[1px] font-mono text-[13px] text-foreground">
            @yourhandle
          </code>
          .
        </p>
      </div>

      {suggestions.length > 0 && (
        <>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {"// SUGGESTED"}
            </span>
            <button
              aria-label="Regenerate suggestions"
              className="inline-flex items-center gap-1.5 px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition hover:text-foreground focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="username-picker-regenerate"
              disabled={disabled}
              onClick={handleRegenerate}
              type="button"
            >
              <SparklesIcon size={11} />
              Regenerate
            </button>
          </div>

          <fieldset
            aria-label="Username suggestions"
            className="m-0 mb-[22px] flex flex-col overflow-hidden rounded-sm border border-border p-0"
          >
            {suggestions.map((label, i) => (
              <SuggestionRow
                active={input === label && status === "available"}
                disabled={disabled}
                divider={i < suggestions.length - 1}
                key={label}
                label={label}
                onClick={() => handleRowClick(label)}
                status={rowStatus[label] ?? "checking"}
              />
            ))}
          </fieldset>
        </>
      )}

      <div className="mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {"// CUSTOM"}
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          className={`flex items-center gap-0 rounded-xs bg-card transition border ${inputBorderClass} ${inputShadow} px-3 py-0.5`}
        >
          <span className="font-mono text-[13px] text-muted-foreground">@</span>
          <input
            aria-describedby="username-picker-status"
            aria-invalid={isErrorStatus(status) || undefined}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="flex-1 border-none bg-transparent px-1 py-2.5 font-mono text-[13px] text-foreground outline-none disabled:opacity-50"
            data-testid="username-picker-input"
            disabled={disabled}
            id="username-picker-input"
            maxLength={20}
            onBlur={() => setFocused(false)}
            onChange={(e) => setInput(e.target.value.trim().toLowerCase())}
            onFocus={() => setFocused(true)}
            placeholder="yourhandle"
            spellCheck={false}
            type="text"
            value={input}
          />
          <span className="pr-2 font-mono text-[13px] text-muted-foreground">
            {PARENT_SUFFIX}
          </span>
        </div>

        <div className="mt-2 h-[18px]">
          <StatusLine input={input} status={status} />
        </div>

        <div
          aria-hidden="true"
          className="mt-[22px] mb-3.5 select-none overflow-hidden whitespace-nowrap font-mono text-[12px] tracking-[0.05em] text-border"
        >
          {DITHER_PATTERN}
        </div>

        <div className="flex items-center justify-between">
          {onSkip ? (
            <button
              className="py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground underline-offset-[3px] transition hover:text-foreground focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="username-picker-skip"
              disabled={disabled}
              onClick={onSkip}
              type="button"
            >
              ← SKIP FOR NOW
            </button>
          ) : (
            <span />
          )}
          <button
            className="inline-flex items-center justify-center rounded-xs border border-foreground bg-foreground px-[18px] py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-background transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            data-testid="username-picker-submit"
            disabled={!canSubmit}
            type="submit"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

interface SuggestionRowProps {
  active: boolean;
  disabled: boolean;
  divider: boolean;
  label: string;
  onClick: () => void;
  status: UsernameCheckStatus;
}

function SuggestionRow({
  label,
  status,
  divider,
  disabled,
  active,
  onClick,
}: SuggestionRowProps) {
  if (status === "invalid" || status === "too-short" || status === "too-long") {
    return null;
  }

  const ok = status === "available";
  const taken = status === "taken" || status === "reserved";
  const checking = status === "checking";
  const errored = status === "error" || status === "verifier-down";
  const clickable = ok && !disabled;

  const tagTone = ok
    ? "bg-success/10 text-success"
    : taken || errored
      ? "bg-destructive/10 text-destructive"
      : "bg-muted text-muted-foreground";
  const tagText = ok
    ? "AVAILABLE"
    : taken
      ? "TAKEN"
      : errored
        ? "CHECK FAILED"
        : "CHECKING…";
  const TagIcon = ok ? CheckIcon : checking ? LoaderIcon : XIcon;

  const handleTextClass = taken
    ? "text-muted-foreground line-through"
    : "text-foreground";

  return (
    <button
      aria-label={`${label}@audric — ${humanStatus(status)}`}
      className={`flex w-full items-center justify-between px-3.5 py-3 text-left transition ${
        divider ? "border-b border-border" : ""
      } ${active ? "bg-muted" : "bg-transparent"} ${
        clickable ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed"
      } focus-visible:bg-muted focus-visible:outline-none`}
      data-status={status}
      data-testid={`username-picker-chip-${label}`}
      disabled={!clickable}
      onClick={clickable ? onClick : undefined}
      type="button"
    >
      <span className={`font-mono text-[13px] ${handleTextClass}`}>
        {label}
        <span className="text-muted-foreground">{PARENT_SUFFIX}</span>
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${tagTone}`}
      >
        <TagIcon className={checking ? "animate-spin" : undefined} size={10} />
        {tagText}
      </span>
    </button>
  );
}

interface StatusLineProps {
  input: string;
  status: UsernameCheckStatus;
}

function StatusLine({ status, input }: StatusLineProps) {
  if (status === "idle" || input === "") {
    return (
      <div
        className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground"
        data-status="idle"
        data-testid="username-picker-status"
        id="username-picker-status"
      >
        {"// 3–20 CHARS · A-Z, 0-9, HYPHEN"}
      </div>
    );
  }

  const message = humanStatusForInput(status, input);
  const tone = isErrorStatus(status)
    ? "text-destructive"
    : status === "available"
      ? "text-success"
      : "text-muted-foreground";
  const prefix = humanStatusPrefix(status);
  const StatusIcon =
    status === "available"
      ? CheckIcon
      : isErrorStatus(status)
        ? XIcon
        : LoaderIcon;

  return (
    <div
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.04em] ${tone}`}
      data-status={status}
      data-testid="username-picker-status"
      id="username-picker-status"
      role={isErrorStatus(status) ? "alert" : "status"}
    >
      <StatusIcon
        className={
          StatusIcon === LoaderIcon && status === "checking"
            ? "animate-spin"
            : undefined
        }
        size={10}
      />
      <span>
        {prefix}
        {message ? ` — ${message}` : ""}
      </span>
    </div>
  );
}

function resultToStatus(r: UsernameCheckResult): UsernameCheckStatus {
  if (r.verifierDown) {
    return "verifier-down";
  }
  if (r.available) {
    return "available";
  }
  if (r.reason === "reserved") {
    return "reserved";
  }
  if (r.reason === "taken") {
    return "taken";
  }
  if (r.reason === "too-short") {
    return "too-short";
  }
  if (r.reason === "too-long") {
    return "too-long";
  }
  return "invalid";
}

function isErrorStatus(s: UsernameCheckStatus): boolean {
  return (
    s === "taken" ||
    s === "reserved" ||
    s === "invalid" ||
    s === "too-short" ||
    s === "too-long" ||
    s === "verifier-down" ||
    s === "error"
  );
}

function humanStatus(s: UsernameCheckStatus): string {
  switch (s) {
    case "idle":
      return "";
    case "checking":
      return "checking…";
    case "available":
      return "available";
    case "taken":
      return "taken";
    case "reserved":
      return "reserved";
    case "invalid":
      return "invalid characters";
    case "too-short":
      return "too short (3 minimum)";
    case "too-long":
      return "too long (20 maximum)";
    case "verifier-down":
      return "verifier unavailable";
    case "error":
      return "check failed";
    default:
      return "";
  }
}

function humanStatusPrefix(s: UsernameCheckStatus): string {
  switch (s) {
    case "available":
      return "// AVAILABLE";
    case "checking":
      return "// CHECKING";
    case "taken":
      return "// TAKEN";
    case "reserved":
      return "// RESERVED";
    case "invalid":
      return "// INVALID";
    case "too-short":
      return "// TOO SHORT";
    case "too-long":
      return "// TOO LONG";
    case "verifier-down":
      return "// VERIFIER DOWN";
    case "error":
      return "// CHECK FAILED";
    default:
      return "";
  }
}

function humanStatusForInput(s: UsernameCheckStatus, input: string): string {
  if (s === "idle" || input === "") {
    return "";
  }
  if (s === "checking") {
    return "one moment";
  }
  if (s === "available") {
    return `${input}@audric is yours to claim`;
  }
  if (s === "taken") {
    return `${input}@audric is taken — try another`;
  }
  if (s === "reserved") {
    return `${input} is reserved`;
  }
  if (s === "too-short") {
    return "handles need 3 characters minimum";
  }
  if (s === "too-long") {
    return "handles can be 20 characters maximum";
  }
  if (s === "invalid") {
    return "use lowercase letters, numbers, hyphens";
  }
  if (s === "verifier-down") {
    return "can't verify availability right now — try again in a moment";
  }
  return "check failed — try again";
}
