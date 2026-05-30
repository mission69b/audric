"use client";

/**
 * Username picker — Geist rebuild to `phase2-username-states.html` (AU6–AU9).
 *
 * The claim logic is unchanged from the legacy port (debounced live
 * availability via `fetchIdentityCheck`, `validateAudricLabel` preflight,
 * `suggestUsernames` near-matches). Only the presentation moved to the
 * prototype: a `bg-card` panel, sans "Pick your handle." title, a single
 * `bg-muted` field (input + `@audric` suffix + inline spinner while
 * checking), a dot statusline (Available · free / Taken · try another /
 * Min 3 characters…), one-tap suggestion pills shown when the typed handle
 * is taken, and a full-width primary "Claim {handle}@audric" button with an
 * optional "Skip for now" ghost.
 *
 * lib helpers (validateAudricLabel, suggestUsernames, fetchIdentityCheck)
 * are imported from `@/lib/identity/*`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchIdentityCheck } from "@/lib/identity/check-fetcher";
import { suggestUsernames } from "@/lib/identity/suggest-usernames";
import {
  type LabelReason,
  validateAudricLabel,
} from "@/lib/identity/validate-label";

const PARENT_SUFFIX = "@audric";
const DEBOUNCE_MS = 300;

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
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<UsernameCheckStatus>("idle");
  const [rowStatus, setRowStatus] = useState<
    Record<string, UsernameCheckStatus>
  >({});
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(
    () => suggestUsernames({ googleName, googleEmail, seed: 0, count: 3 }),
    [googleName, googleEmail]
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

  const canSubmit = status === "available" && !disabled;
  const submitLabel = (() => {
    if (disabled) {
      return "Claiming…";
    }
    if (status === "available" && input) {
      return `Claim ${input}${PARENT_SUFFIX}`;
    }
    return "Claim handle";
  })();

  // Field border tone: available → signal, error → destructive, focus →
  // blue ring, else neutral. Matches phase2-username-states.html.
  const fieldTone = (() => {
    if (isErrorStatus(status)) {
      return "border-destructive/40";
    }
    if (status === "available") {
      return "border-signal/40";
    }
    if (focused) {
      return "border-ring shadow-[0_0_0_4px_color-mix(in_srgb,var(--ring)_22%,transparent)]";
    }
    return "border-border";
  })();

  // Suggestion pills surface when the typed handle is unavailable —
  // offer the available near-matches as one-tap chips (AU9).
  const showSuggestions =
    (status === "taken" || status === "reserved") &&
    suggestions.some((s) => rowStatus[s] === "available");

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
      data-testid="username-picker"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 font-medium font-sans text-[20px] text-foreground tracking-[-0.025em]">
          Pick your handle.
        </h2>
        <p className="m-0 text-[13px] text-muted-foreground leading-[1.5]">
          Your Audric Passport and on-chain identity. People send to{" "}
          <code className="font-mono text-foreground">@yourhandle</code> instead
          of an address.
        </p>
      </div>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div
          className={`flex items-center rounded-lg border bg-muted px-3.5 py-1 transition ${fieldTone}`}
        >
          <input
            aria-describedby="username-picker-status"
            aria-invalid={isErrorStatus(status) || undefined}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="min-w-0 flex-1 border-none bg-transparent py-2.5 font-mono text-[16px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
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
          <span className="font-mono text-[14px] text-muted-foreground">
            {PARENT_SUFFIX}
          </span>
          {status === "checking" && (
            <span
              aria-hidden="true"
              className="ml-2 size-3.5 animate-spin rounded-full border-[1.5px] border-muted-foreground border-t-transparent"
            />
          )}
        </div>

        <div className="min-h-4">
          <StatusLine input={input} status={status} />
        </div>

        {showSuggestions && (
          <div
            className="flex flex-wrap gap-1.5"
            data-testid="username-suggestions"
          >
            {suggestions
              .filter((s) => rowStatus[s] === "available")
              .map((label) => (
                <button
                  className="inline-flex h-7 items-center rounded-full border border-border bg-transparent px-3 font-mono text-[12px] text-foreground transition hover:border-[var(--border-strong)] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid={`username-picker-chip-${label}`}
                  disabled={disabled}
                  key={label}
                  onClick={() => handleRowClick(label)}
                  type="button"
                >
                  {label}
                  <span className="text-muted-foreground">{PARENT_SUFFIX}</span>
                </button>
              ))}
          </div>
        )}

        <button
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 font-medium font-sans text-[14px] text-primary-foreground tracking-[-0.011em] transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="username-picker-submit"
          disabled={!canSubmit}
          type="submit"
        >
          {submitLabel}
        </button>

        {onSkip && (
          <button
            className="font-sans text-[12.5px] text-muted-foreground transition hover:text-foreground focus-visible:underline focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="username-picker-skip"
            disabled={disabled}
            onClick={onSkip}
            type="button"
          >
            Skip for now
          </button>
        )}
      </form>
    </div>
  );
}

interface StatusLineProps {
  input: string;
  status: UsernameCheckStatus;
}

function StatusLine({ status, input }: StatusLineProps) {
  if (status === "idle" || input === "") {
    return (
      <p
        className="m-0 font-mono text-[11px] text-muted-foreground tracking-[0.04em]"
        data-status="idle"
        data-testid="username-picker-status"
        id="username-picker-status"
      >
        3–20 characters · letters, numbers, hyphens
      </p>
    );
  }

  const tone = isErrorStatus(status)
    ? "text-destructive"
    : status === "available"
      ? "text-signal"
      : "text-muted-foreground";
  const showDot = status === "available" || isErrorStatus(status);

  return (
    <p
      className={`m-0 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.04em] ${tone}`}
      data-status={status}
      data-testid="username-picker-status"
      id="username-picker-status"
      role={isErrorStatus(status) ? "alert" : "status"}
    >
      {showDot && <span className="size-[5px] rounded-full bg-current" />}
      {statusCopy(status)}
    </p>
  );
}

function statusCopy(status: UsernameCheckStatus): string {
  switch (status) {
    case "checking":
      return "Checking availability…";
    case "available":
      return "Available · free";
    case "taken":
      return "Taken · try another";
    case "reserved":
      return "Reserved · try another";
    case "too-short":
      return "Min 3 characters · letters, numbers, hyphens";
    case "too-long":
      return "Max 20 characters";
    case "invalid":
      return "Letters, numbers, and hyphens only";
    case "verifier-down":
    case "error":
      return "Couldn't check — try again in a moment";
    default:
      return "";
  }
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
