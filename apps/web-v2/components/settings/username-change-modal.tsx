"use client";

/**
 * Username change modal — Geist rebuild to `phase2-username-states.html`
 * (AU12). Reached from the Passport settings section's CHANGE affordance.
 *
 * Behavior is unchanged from the Session 4.7.C port (live 300ms-debounced
 * availability check, 503/429 → verifier-down, release warning, success →
 * DONE). The presentation moved to the prototype: a sans "Change handle"
 * header with the current handle as a "Current:" sub, a single `bg-muted`
 * field (input + `@audric` suffix + inline checking spinner), a dot
 * statusline, an amber warn-note about releasing the old handle, and a
 * Cancel / "Change to {new}@audric" footer. Success collapses to the calm
 * AU11 confirmation (signal check-circle + mono handle + Done).
 *
 * shadcn `<Dialog>` provides the focus trap, ARIA dialog semantics, portal
 * rendering, and focus restoration on close.
 */

import { CheckIcon, XIcon } from "lucide-react";
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
  const fieldTone = (() => {
    if (isLocalError || isAvailabilityError) {
      return "border-destructive/40";
    }
    if (availability === "available") {
      return "border-signal/40";
    }
    if (focused) {
      return "border-ring shadow-[0_0_0_4px_color-mix(in_srgb,var(--ring)_22%,transparent)]";
    }
    return "border-border";
  })();

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
        className="overflow-hidden bg-card p-0 ring-1 ring-border sm:max-w-[400px]"
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
            <div className="flex items-start justify-between gap-4 px-5 pt-[18px] pb-3">
              <div className="min-w-0">
                <DialogTitle className="m-0 font-medium font-sans text-[16px] text-foreground tracking-[-0.014em]">
                  Change handle
                </DialogTitle>
                <p className="mt-1 m-0 truncate font-mono text-[13px] text-muted-foreground">
                  Current: {currentFull}
                </p>
              </div>
              <button
                aria-label="Close"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:opacity-50"
                disabled={isSubmitting}
                onClick={onClose}
                type="button"
              >
                <XIcon size={14} />
              </button>
            </div>

            <form
              className="flex flex-col gap-3 px-5 pt-1 pb-4"
              onSubmit={handleSubmit}
            >
              <div
                className={`flex items-center rounded-lg border bg-muted px-3.5 py-1 transition ${fieldTone}`}
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
                  className="min-w-0 flex-1 border-none bg-transparent py-2.5 font-mono text-[16px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
                  disabled={isSubmitting}
                  id={inputId}
                  maxLength={20}
                  onBlur={() => setFocused(false)}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setSubmitError(null);
                  }}
                  onFocus={() => setFocused(true)}
                  placeholder="newhandle"
                  ref={inputRef}
                  spellCheck={false}
                  type="text"
                  value={value}
                />
                <span className="font-mono text-[14px] text-muted-foreground">
                  {PARENT_SUFFIX}
                </span>
                {availability === "checking" && (
                  <span
                    aria-hidden="true"
                    className="ml-2 size-3.5 animate-spin rounded-full border-[1.5px] border-muted-foreground border-t-transparent"
                  />
                )}
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

              <div className="flex items-start gap-2 font-mono text-[11px] text-warning tracking-[0.02em]">
                <span aria-hidden="true">!</span>
                <span className="leading-[1.5]">
                  {currentFull} is released and someone else can claim it.
                  Update anyone who pays you.
                </span>
              </div>

              <div className="mt-1 flex gap-2 border-t border-border pt-3">
                <button
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-border bg-card font-medium font-sans text-[13px] text-foreground transition hover:bg-accent focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:opacity-50"
                  disabled={isSubmitting}
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-primary px-3 font-medium font-sans text-[13px] text-primary-foreground transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
                  {isSubmitting
                    ? "Changing…"
                    : `Change to ${validation.label || "…"}${PARENT_SUFFIX}`}
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
      className="flex flex-col items-center gap-[18px] p-6 text-center"
      data-testid="username-change-modal-success"
    >
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-signal text-background">
        <CheckIcon aria-hidden="true" size={20} strokeWidth={1.8} />
      </span>
      <div className="flex flex-col gap-2">
        <DialogTitle className="break-all font-medium font-mono text-[22px] text-foreground tracking-[-0.018em]">
          {fullHandle}
        </DialogTitle>
        <p className="m-0 text-[13px] text-muted-foreground leading-[1.5]">
          Handle changed. It can take a few seconds to propagate everywhere.
        </p>
      </div>
      <button
        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 font-medium font-sans text-[14px] text-primary-foreground tracking-[-0.011em] transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
        data-testid="username-change-modal-done"
        onClick={onDone}
        type="button"
      >
        Done
      </button>
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
  const isError = Boolean(submitError) || isLocalError || isAvailabilityError;
  const tone = isError
    ? "text-destructive"
    : availability === "available"
      ? "text-signal"
      : "text-muted-foreground";
  const role =
    submitError || validationHint || isAvailabilityError ? "alert" : "status";

  const message = (() => {
    if (submitError) {
      return submitError;
    }
    if (isLocalError && validationHint) {
      return validationHint;
    }
    if (status === "idle") {
      return "3–20 characters · letters, numbers, hyphens";
    }
    if (availability === "checking") {
      return "Checking availability…";
    }
    if (availability === "available") {
      return "Available · free";
    }
    if (availability === "taken") {
      return `${label}${PARENT_SUFFIX} is already claimed`;
    }
    if (availability === "verifier-down") {
      return "Couldn't check right now — try again";
    }
    if (availability === "error") {
      return "Check failed — try again";
    }
    return "3–20 characters · letters, numbers, hyphens";
  })();

  const showDot = availability === "available" || isError;

  return (
    <p
      className={`m-0 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.04em] ${tone}`}
      id={helpId}
      role={role}
    >
      {showDot && <span className="size-[5px] rounded-full bg-current" />}
      {message}
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
