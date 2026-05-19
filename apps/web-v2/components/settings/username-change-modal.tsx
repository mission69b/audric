"use client";

/**
 * Username change modal — Session 4.7.C rebuild.
 *
 * UX/behavior parity with the Session 2 port:
 *   - Live availability check (300ms debounce, 503/429 → verifier-down)
 *   - Warning callout on "this action is final"
 *   - Success card with serif new-handle + DONE dismissal
 *
 * Diffs from Session 2:
 *   - Bespoke scrim + manual ESC keydown listener REPLACED by shadcn
 *     `<Dialog>` + `<DialogContent>`. Brings free focus trap, proper
 *     ARIA dialog semantics, portal rendering, animated overlay, and
 *     correct focus restoration on close.
 *   - LoC is roughly unchanged — the win here is plumbing modernity +
 *     accessibility, not size. The form logic, status messaging,
 *     warning callout, and success card layout stay verbatim because
 *     they're the brand-aligned UX (serif lockup, mono captions, error
 *     and success color tokens) that's the deliverable of the Audric
 *     Passport surface. See PRAGMATIC scope decision in
 *     RUNBOOK_v07c_phase_6_cutover.md §4.7.C.
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 6 Session 4.7.B-C";
 * legacy reference: apps/web/components/identity/UsernameChangeModal.tsx.
 */

import { CheckIcon, LoaderIcon, XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { audricWebUrl } from "@/lib/audric-web-url";
import { fetchIdentityCheck } from "@/lib/identity/check-fetcher";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";

const PARENT_SUFFIX = "@audric";
const CHECK_DEBOUNCE_MS = 300;

type Phase = "idle" | "submitting" | "success";

type Availability =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "verifier-down"
  | "error";

type ChangeReason =
  | "invalid"
  | "too-short"
  | "too-long"
  | "reserved"
  | "taken"
  | "unchanged";

interface ChangeSuccessBody {
  fullHandle: string;
  newLabel: string;
  oldLabel: string;
  success: true;
  txDigest: string;
  walletAddress: string;
}

interface ChangeErrorBody {
  error: string;
  reason?: ChangeReason;
}

export interface UsernameChangeModalProps {
  address: string;
  changeFetcher?: (newLabel: string) => Promise<ChangeSuccessBody>;
  checkFetcher?: (label: string) => Promise<{
    available: boolean;
    reason?: string;
    verifierDown?: boolean;
  }>;
  currentLabel: string;
  jwt: string;
  onChanged: (newLabel: string, fullHandle: string) => void;
  onClose: () => void;
  open: boolean;
}

export class ChangeError extends Error {
  readonly status: number;
  readonly reason: ChangeReason | "verifier-down" | "rate-limit" | "unknown";

  constructor(
    status: number,
    reason: ChangeReason | "verifier-down" | "rate-limit" | "unknown",
    message: string
  ) {
    super(message);
    this.name = "ChangeError";
    this.status = status;
    this.reason = reason;
  }
}

export function UsernameChangeModal({
  address,
  changeFetcher,
  checkFetcher,
  currentLabel,
  jwt,
  onChanged,
  onClose,
  open,
}: UsernameChangeModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [value, setValue] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successHandle, setSuccessHandle] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const helpId = useId();

  // Reset state on each open so a previous error / success state
  // doesn't leak into the next session.
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setValue("");
      setSubmitError(null);
      setSuccessHandle(null);
      setFocused(false);
      setAvailability("idle");
    }
  }, [open]);

  const defaultFetcher = useCallback(
    async (newLabel: string): Promise<ChangeSuccessBody> => {
      const res = await fetch(audricWebUrl("/api/identity/change"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-zklogin-jwt": jwt,
        },
        body: JSON.stringify({ newLabel, address }),
      });
      if (!res.ok) {
        const body: ChangeErrorBody = await res
          .json()
          .catch(() => ({ error: "Unknown error" }));
        const reason: ChangeError["reason"] =
          res.status === 503
            ? "verifier-down"
            : res.status === 429
              ? "rate-limit"
              : (body.reason ?? "unknown");
        throw new ChangeError(res.status, reason, body.error);
      }
      return (await res.json()) as ChangeSuccessBody;
    },
    [address, jwt]
  );

  const fetcher = changeFetcher ?? defaultFetcher;

  const validation = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return {
        ok: false,
        status: "idle" as const,
        hint: null as string | null,
        label: "",
      };
    }
    const v = validateAudricLabel(trimmed);
    if (!v.valid) {
      const hint = reasonToCopy(v.reason, trimmed);
      return {
        ok: false,
        status: v.reason as "invalid" | "too-short" | "too-long",
        hint,
        label: trimmed.toLowerCase(),
      };
    }
    if (v.label === currentLabel) {
      return {
        ok: false,
        status: "unchanged" as const,
        hint: "That's your current handle — pick something different.",
        label: v.label,
      };
    }
    if (isReserved(v.label)) {
      return {
        ok: false,
        status: "reserved" as const,
        hint: reasonToCopy("reserved", v.label),
        label: v.label,
      };
    }
    return {
      ok: true,
      status: "ok" as const,
      hint: null as string | null,
      label: v.label,
    };
  }, [value, currentLabel]);

  const defaultCheckFetcher = useCallback(fetchIdentityCheck, []);
  const liveCheck = checkFetcher ?? defaultCheckFetcher;

  const checkIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!validation.ok) {
      setAvailability("idle");
      return;
    }

    setAvailability("checking");
    checkIdRef.current += 1;
    const id = checkIdRef.current;

    debounceTimerRef.current = setTimeout(() => {
      liveCheck(validation.label)
        .then((r) => {
          if (checkIdRef.current !== id) {
            return;
          }
          if (r.verifierDown) {
            setAvailability("verifier-down");
          } else if (r.available) {
            setAvailability("available");
          } else if (r.reason === "taken" || r.reason === "reserved") {
            setAvailability("taken");
          } else {
            setAvailability("error");
          }
        })
        .catch(() => {
          if (checkIdRef.current !== id) {
            return;
          }
          setAvailability("error");
        });
    }, CHECK_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [validation, liveCheck]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validation.ok || phase === "submitting") {
        return;
      }
      if (availability === "taken" || availability === "checking") {
        return;
      }
      setPhase("submitting");
      setSubmitError(null);
      try {
        const body = await fetcher(validation.label);
        setSuccessHandle(`${body.newLabel}${PARENT_SUFFIX}`);
        setPhase("success");
        onChanged(body.newLabel, body.fullHandle);
      } catch (err) {
        const message =
          err instanceof ChangeError
            ? reasonToCopy(err.reason, validation.label)
            : "Network error — please try again.";
        setSubmitError(message);
        setPhase("idle");
      }
    },
    [validation, phase, availability, fetcher, onChanged]
  );

  const currentFull = `${currentLabel}${PARENT_SUFFIX}`;
  const isSuccess = phase === "success" && successHandle !== null;
  const isSubmitting = phase === "submitting";

  const isLocalError =
    validation.status === "invalid" ||
    validation.status === "too-long" ||
    validation.status === "too-short" ||
    validation.status === "reserved" ||
    validation.status === "unchanged";
  const isAvailabilityError =
    availability === "taken" || availability === "error";
  const inputBorderClass = (() => {
    if (isLocalError || isAvailabilityError) {
      return "border-error-border";
    }
    if (availability === "available") {
      return "border-success-border";
    }
    if (focused) {
      return "border-border-focus";
    }
    return "border-border-subtle";
  })();
  const inputShadow = focused
    ? isLocalError || isAvailabilityError
      ? "shadow-[0_0_0_3px_rgba(213,11,11,0.18)]"
      : availability === "available"
        ? "shadow-[0_0_0_3px_rgba(60,193,78,0.18)]"
        : "shadow-[var(--shadow-focus-ring)]"
    : "";

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!(next || isSubmitting)) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent
        className="overflow-hidden bg-surface-card p-0 ring-1 ring-border-subtle sm:max-w-[520px]"
        data-testid="username-change-modal"
        onOpenAutoFocus={(e) => {
          // Pre-focus the input field so the user can start typing
          // immediately. shadcn focuses the close button by default.
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        showCloseButton={false}
      >
        {isSuccess ? (
          <SuccessCard fullHandle={successHandle} onDone={onClose} />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border-subtle px-[18px] py-3.5">
              <DialogTitle className="font-mono text-[11px] text-fg-primary uppercase tracking-[0.1em]">
                {"// CHANGE HANDLE"}
              </DialogTitle>
              <button
                aria-label="Close"
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted transition hover:bg-surface-sunken hover:text-fg-primary focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:opacity-50"
                disabled={isSubmitting}
                onClick={onClose}
                type="button"
              >
                <XIcon size={12} />
              </button>
            </div>

            <form className="px-6 pt-5 pb-6" onSubmit={handleSubmit}>
              <div className="mb-[18px]">
                <div className="mb-1.5 font-mono text-[10px] text-fg-muted uppercase tracking-[0.1em]">
                  CURRENT
                </div>
                <div className="rounded-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-mono text-[14px] text-fg-secondary">
                  {currentLabel}
                  <span className="text-fg-muted">{PARENT_SUFFIX}</span>
                </div>
              </div>

              <div>
                <label
                  className="mb-1.5 block font-mono text-[10px] text-fg-muted uppercase tracking-[0.1em]"
                  htmlFor={inputId}
                >
                  NEW HANDLE
                </label>
                <div
                  className={`flex items-center rounded-xs bg-surface-card transition border ${inputBorderClass} ${inputShadow} px-3 py-0.5`}
                >
                  <input
                    aria-describedby={helpId}
                    aria-invalid={
                      (validation.status !== "idle" &&
                        validation.status !== "ok") ||
                      undefined
                    }
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    className="min-w-0 flex-1 border-none bg-transparent px-1 py-2.5 font-mono text-[14px] text-fg-primary outline-none placeholder:text-fg-muted disabled:opacity-50"
                    disabled={isSubmitting}
                    id={inputId}
                    maxLength={20}
                    onBlur={() => setFocused(false)}
                    onChange={(e) => {
                      setValue(e.target.value);
                      setSubmitError(null);
                    }}
                    onFocus={() => setFocused(true)}
                    placeholder="alice"
                    ref={inputRef}
                    spellCheck={false}
                    type="text"
                    value={value}
                  />
                  <span className="pr-1 font-mono text-[14px] text-fg-muted">
                    {PARENT_SUFFIX}
                  </span>
                </div>

                <StatusLine
                  availability={availability}
                  helpId={helpId}
                  isAvailabilityError={isAvailabilityError}
                  isLocalError={isLocalError}
                  label={validation.label}
                  status={validation.status}
                  submitError={submitError}
                  validationHint={validation.hint}
                />
              </div>

              <div className="mt-[18px] flex items-start gap-2 rounded-sm border border-warning-border bg-warning-bg px-3 py-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-solid"
                />
                <p className="text-[12.5px] text-warning-fg leading-[1.5]">
                  Changing your handle releases{" "}
                  <span className="font-mono">{currentFull}</span> on Sui.
                  Anyone can claim it after — including someone else.{" "}
                  <strong className="font-semibold">
                    This action is final.
                  </strong>
                </p>
              </div>

              <div className="mt-[22px] flex items-center justify-end gap-2">
                <button
                  className="rounded-sm border border-border-subtle bg-surface-card px-4 py-2.5 font-mono text-[11px] text-fg-primary uppercase tracking-[0.08em] transition hover:border-border-strong focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:opacity-50"
                  disabled={isSubmitting}
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-sm border border-fg-primary bg-fg-primary px-4 py-2.5 font-mono text-[11px] text-fg-inverse uppercase tracking-[0.1em] transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                  data-testid="username-change-modal-submit"
                  disabled={
                    !validation.ok ||
                    isSubmitting ||
                    availability === "checking" ||
                    availability === "taken" ||
                    availability === "error" ||
                    availability === "idle"
                  }
                  type="submit"
                >
                  {isSubmitting ? "Changing…" : "CHANGE HANDLE"}
                </button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SuccessCardProps {
  fullHandle: string;
  onDone: () => void;
}

function SuccessCard({ fullHandle, onDone }: SuccessCardProps) {
  return (
    <div
      className="px-8 pt-9 pb-3.5 text-center"
      data-testid="username-change-modal-success"
    >
      <div
        aria-hidden="true"
        className="mx-auto mb-[18px] flex h-11 w-11 items-center justify-center rounded-full border border-success-border bg-success-bg text-success-fg"
      >
        <CheckIcon size={20} />
      </div>
      <DialogTitle className="mb-3.5 font-mono text-[11px] text-fg-secondary uppercase tracking-[0.14em]">
        HANDLE CHANGED
      </DialogTitle>
      <div className="break-all font-medium font-serif text-[22px] text-fg-primary leading-[1.15] tracking-[-0.005em]">
        {fullHandle}
      </div>
      <p className="mx-auto mt-3.5 max-w-[320px] text-[13px] text-fg-secondary leading-[1.55]">
        It can take a few seconds to propagate everywhere.
      </p>
      <div className="mt-7 border-t border-border-subtle pt-3.5">
        <button
          className="rounded-sm border border-fg-primary bg-fg-primary px-4 py-2.5 font-mono text-[11px] text-fg-inverse uppercase tracking-[0.1em] transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          data-testid="username-change-modal-done"
          onClick={onDone}
          type="button"
        >
          DONE
        </button>
      </div>
    </div>
  );
}

interface StatusLineProps {
  availability: Availability;
  helpId: string;
  isAvailabilityError: boolean;
  isLocalError: boolean;
  label: string;
  status: string;
  submitError: string | null;
  validationHint: string | null;
}

function StatusLine({
  availability,
  helpId,
  isAvailabilityError,
  isLocalError,
  label,
  status,
  submitError,
  validationHint,
}: StatusLineProps) {
  const tone =
    submitError || isLocalError || isAvailabilityError
      ? "text-error-fg"
      : availability === "available"
        ? "text-success-fg"
        : "text-fg-muted";
  const role =
    submitError || validationHint || isAvailabilityError ? "alert" : "status";
  const content = (() => {
    if (submitError) {
      return (
        <>
          <XIcon aria-hidden="true" size={10} />
          <span>{submitError}</span>
        </>
      );
    }
    if (isLocalError && validationHint) {
      return (
        <>
          <XIcon aria-hidden="true" size={10} />
          <span>{validationHint}</span>
        </>
      );
    }
    if (status === "idle") {
      return <span>{"// 3–20 CHARS · LOWERCASE, DIGITS, HYPHEN"}</span>;
    }
    if (availability === "checking") {
      return (
        <>
          <LoaderIcon aria-hidden="true" className="animate-spin" size={10} />
          <span>{"// CHECKING"}</span>
        </>
      );
    }
    if (availability === "available") {
      return (
        <>
          <CheckIcon aria-hidden="true" size={10} />
          <span>{"// AVAILABLE"}</span>
        </>
      );
    }
    if (availability === "taken") {
      return (
        <>
          <XIcon aria-hidden="true" size={10} />
          <span>{`// TAKEN — ${label}${PARENT_SUFFIX} is already claimed`}</span>
        </>
      );
    }
    if (availability === "verifier-down") {
      return (
        <>
          <XIcon aria-hidden="true" size={10} />
          <span>{"// VERIFIER DOWN — can't check right now, try again"}</span>
        </>
      );
    }
    if (availability === "error") {
      return (
        <>
          <XIcon aria-hidden="true" size={10} />
          <span>{"// CHECK FAILED — try again"}</span>
        </>
      );
    }
    return <span>{"// 3–20 CHARS · LOWERCASE, DIGITS, HYPHEN"}</span>;
  })();

  return (
    <p
      className={`mt-2 inline-flex items-start gap-1.5 font-mono text-[11px] uppercase tracking-[0.04em] ${tone}`}
      id={helpId}
      role={role}
    >
      {content}
    </p>
  );
}

function reasonToCopy(
  reason:
    | ChangeError["reason"]
    | "invalid"
    | "too-short"
    | "too-long"
    | "reserved"
    | "unchanged",
  label: string
): string {
  const fullHandle = `${label}${PARENT_SUFFIX}`;
  switch (reason) {
    case "taken":
      return `${fullHandle} is already claimed — try a different name.`;
    case "reserved":
      return `${fullHandle} is reserved — try a different name.`;
    case "invalid":
      return "Letters, numbers, and hyphens only — no leading or trailing hyphens.";
    case "too-short":
      return "Handles need at least 3 characters.";
    case "too-long":
      return "Handles can be at most 20 characters.";
    case "unchanged":
      return "That's your current handle — pick something different.";
    case "verifier-down":
      return "Couldn't verify the name on Sui right now — please try again in a moment.";
    case "rate-limit":
      return "Too many change attempts — please wait before trying again.";
    default:
      return "Could not change the handle — please try again.";
  }
}
