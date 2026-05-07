'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { validateAudricLabel } from '@/lib/identity/validate-label';
import { isReserved } from '@/lib/identity/reserved-usernames';
import { fetchIdentityCheck } from '@/lib/identity/check-fetcher';

// ───────────────────────────────────────────────────────────────────────────
// S.84 — UsernameChangeModal
//
// [B6 design pass] Visual rewrite to the change-handle handoff layout
// (`design_handoff_username_flow/change-handle.jsx` → `<ChangeHandleModal/>`
// + `<HandleChangedModal/>`). Layout reference: same handoff README §B1+B2.
//
// Single component, two visual modes — chosen because the spec defines
// these as a tightly-coupled state machine (form → success → dismiss),
// and they share the same mount + the same close handlers. Two siblings
// would duplicate the scrim + Escape + click-outside wiring.
//
// Mode 1: form (520px card)
//   • Mono header strip — `// CHANGE HANDLE` (left), close icon (right),
//     hairline-bottom rule.
//   • CURRENT field — mono uppercase label + read-only sunken well
//     showing the existing handle.
//   • NEW HANDLE field — mono uppercase label + input shell with focus
//     shadow tinted on validation state (red on bad, green on ok, blue
//     on focus).
//   • Status line beneath input — `// AVAILABLE`, `// TAKEN — pick
//     another`, idle hint `// 3–20 CHARS · LOWERCASE, DIGITS, HYPHEN`.
//   • Warning callout — warning-bg + warning-border + colored dot
//     indicator + "Changing your handle releases <current>.audric.sui …
//     This action is final." copy.
//   • Footer — Cancel (mono outline) + CHANGE HANDLE (mono primary,
//     disabled when invalid).
//
// Mode 2: success (460px card)
//   • Centered green check (44px circle, success-bg + success-border).
//   • Mono `HANDLE CHANGED` label.
//   • Big serif new handle (22px equivalent — we use `font-serif` to
//     match the hero-handle pattern in <UsernameClaimSuccess>).
//   • Body copy: "It can take a few seconds to propagate everywhere."
//   • Footer with hairline divider + single centered `DONE` mono
//     primary. NO auto-close — explicit dismissal per design.
//
// Composition contract is unchanged: `open` / `address` / `jwt` /
// `currentLabel` / `onClose` / `onChanged` / optional `changeFetcher`.
// ───────────────────────────────────────────────────────────────────────────

// [S.118 / 2026-05-08] Display switched from `.audric.sui` (full
// on-chain handle) to `@audric` (SuiNS V2 short-form alias). Both
// forms resolve to the same address; this is purely a render-layer
// choice. The on-chain NFT name is still `<label>.audric.sui` (see
// `lib/identity/change` route + the SDK's `fullHandle()`).
const PARENT_SUFFIX = '@audric';
const PARENT_SUFFIX_ONCHAIN = '.audric.sui'; // kept for ARIA labels referencing the on-chain object
const CHECK_DEBOUNCE_MS = 300;

type Phase = 'idle' | 'submitting' | 'success';

// [S18-F18] Live availability state — mirrors UsernamePicker's pattern.
// Pre-fix the modal only did local syntax validation and showed AVAILABLE
// for any well-formed handle, so users could type a known-taken name
// (e.g. funkii) and see "// AVAILABLE" until they clicked CHANGE HANDLE
// and got the 409 surprise. The picker has been doing it right since
// SPEC 10 Phase B.1; the change modal just never got the same treatment.
type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'verifier-down' | 'error';

type ChangeReason =
  | 'invalid'
  | 'too-short'
  | 'too-long'
  | 'reserved'
  | 'taken'
  | 'unchanged';

interface ChangeSuccessBody {
  success: true;
  oldLabel: string;
  newLabel: string;
  fullHandle: string;
  txDigest: string;
  walletAddress: string;
}

interface ChangeErrorBody {
  error: string;
  reason?: ChangeReason;
}

export interface UsernameChangeModalProps {
  open: boolean;
  address: string;
  jwt: string;
  currentLabel: string;
  /** Called when the user dismisses (Cancel, Esc, backdrop, or DONE on success). */
  onClose: () => void;
  /**
   * Fired when the API returns 200 (BEFORE the user clicks DONE).
   * Parent should refetch userStatus here so downstream surfaces
   * (sidebar, greeting, chat) update on next render. The modal stays
   * open in success mode until the user dismisses.
   */
  onChanged: (newLabel: string, fullHandle: string) => void;
  changeFetcher?: (newLabel: string) => Promise<ChangeSuccessBody>;
  /**
   * [S18-F18] Optional live-availability fetcher. Defaults to
   * GET /api/identity/check?username=<label>. Tests inject a stub.
   */
  checkFetcher?: (label: string) => Promise<{ available: boolean; reason?: string; verifierDown?: boolean }>;
}

export class ChangeError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: ChangeReason | 'verifier-down' | 'rate-limit' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'ChangeError';
  }
}

export function UsernameChangeModal({
  open,
  address,
  jwt,
  currentLabel,
  onClose,
  onChanged,
  changeFetcher,
  checkFetcher,
}: UsernameChangeModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [value, setValue] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successHandle, setSuccessHandle] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [availability, setAvailability] = useState<Availability>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const helpId = useId();

  // Reset state on open so prior errors / typed values don't bleed across sessions.
  useEffect(() => {
    if (open) {
      setPhase('idle');
      setValue('');
      setSubmitError(null);
      setSuccessHandle(null);
      setFocused(false);
      setAvailability('idle');
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  // Escape closes (unless mid-submit, which would orphan the request promise).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'submitting') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, phase, onClose]);

  const defaultFetcher = useCallback(
    async (newLabel: string): Promise<ChangeSuccessBody> => {
      const res = await fetch('/api/identity/change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zklogin-jwt': jwt,
        },
        body: JSON.stringify({ newLabel, address }),
      });
      if (!res.ok) {
        const body: ChangeErrorBody = await res
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        const reason: ChangeError['reason'] =
          res.status === 503
            ? 'verifier-down'
            : res.status === 429
              ? 'rate-limit'
              : (body.reason ?? 'unknown');
        throw new ChangeError(res.status, reason, body.error);
      }
      return (await res.json()) as ChangeSuccessBody;
    },
    [address, jwt],
  );

  const fetcher = changeFetcher ?? defaultFetcher;

  const validation = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return {
        ok: false,
        status: 'idle' as const,
        hint: null as string | null,
        label: '',
      };
    }
    const v = validateAudricLabel(trimmed);
    if (!v.valid) {
      const hint = reasonToCopy(v.reason, trimmed);
      return {
        ok: false,
        status: v.reason as 'invalid' | 'too-short' | 'too-long',
        hint,
        label: trimmed.toLowerCase(),
      };
    }
    if (v.label === currentLabel) {
      return {
        ok: false,
        status: 'unchanged' as const,
        hint: `That's your current handle — pick something different.`,
        label: v.label,
      };
    }
    if (isReserved(v.label)) {
      return {
        ok: false,
        status: 'reserved' as const,
        hint: reasonToCopy('reserved', v.label),
        label: v.label,
      };
    }
    return {
      ok: true,
      status: 'ok' as const,
      hint: null as string | null,
      label: v.label,
    };
  }, [value, currentLabel]);

  // [S18-F18] Live availability check — debounced GET /api/identity/check.
  // Same pattern as UsernamePicker.tsx: 300ms debounce, last-write-wins
  // via checkIdRef, only fires when local validation passes (so we don't
  // burn server checks on syntactically invalid input).
  // [S18-F19] HTTP-status mapping (incl. 503 + 429 → verifierDown) is
  // owned by `lib/identity/check-fetcher.ts` so the modal and the
  // signup picker stay aligned. Wrapped in useCallback to keep the
  // existing `liveCheck` dependency contract for `useEffect`.
  const defaultCheckFetcher = useCallback(fetchIdentityCheck, []);
  const liveCheck = checkFetcher ?? defaultCheckFetcher;

  const checkIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    // Only check when local validation passes — avoids burning server
    // calls on too-short / invalid charset / reserved / unchanged input,
    // each of which already shows the right error inline.
    if (!validation.ok) {
      setAvailability('idle');
      return;
    }

    setAvailability('checking');
    const id = ++checkIdRef.current;

    debounceTimerRef.current = setTimeout(() => {
      liveCheck(validation.label)
        .then((r) => {
          if (checkIdRef.current !== id) return;
          if (r.verifierDown) setAvailability('verifier-down');
          else if (r.available) setAvailability('available');
          else if (r.reason === 'taken' || r.reason === 'reserved') setAvailability('taken');
          else setAvailability('error');
        })
        .catch(() => {
          if (checkIdRef.current !== id) return;
          setAvailability('error');
        });
    }, CHECK_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [validation, liveCheck]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      // [S18-F18] Block submit unless live check confirmed available.
      // verifier-down is permitted (server has its own check; we don't
      // want to wedge the user when SuiNS is degraded).
      if (!validation.ok || phase === 'submitting') return;
      if (availability === 'taken' || availability === 'checking') return;
      setPhase('submitting');
      setSubmitError(null);
      try {
        const body = await fetcher(validation.label);
        // [S.118] Render the @audric display form on the success card
        // even though the API returns the on-chain `<label>.audric.sui`
        // form. The display form is the user-facing identity; the
        // on-chain form is technical / for SuiNS RPC calls.
        setSuccessHandle(`${body.newLabel}${PARENT_SUFFIX}`);
        setPhase('success');
        onChanged(body.newLabel, body.fullHandle);
      } catch (err) {
        const message =
          err instanceof ChangeError
            ? reasonToCopy(err.reason, validation.label)
            : 'Network error — please try again.';
        setSubmitError(message);
        setPhase('idle');
      }
    },
    [validation, phase, availability, fetcher, onChanged],
  );

  if (!open) return null;

  const currentFull = `${currentLabel}${PARENT_SUFFIX}`;
  const isSuccess = phase === 'success' && successHandle !== null;
  const isSubmitting = phase === 'submitting';

  // Backdrop scrim — design spec: rgba(0,0,0,0.42).
  const scrimClass = 'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.42)] px-4';

  // [S18-F18] Per-state input shell tinting now incorporates the live
  // availability check. Local validation errors (invalid charset, too
  // short, etc.) tint red. A passed-validation handle that came back
  // 'taken' from /api/identity/check ALSO tints red. Only an explicit
  // 'available' from the live check turns the shell green and unlocks
  // the submit button.
  const isLocalError =
    validation.status === 'invalid' ||
    validation.status === 'too-long' ||
    validation.status === 'too-short' ||
    validation.status === 'reserved' ||
    validation.status === 'unchanged';
  const isAvailabilityError = availability === 'taken' || availability === 'error';
  const inputBorderClass = (() => {
    if (isLocalError || isAvailabilityError) return 'border-error-border';
    if (availability === 'available') return 'border-success-border';
    if (focused) return 'border-border-focus';
    return 'border-border-subtle';
  })();
  const inputShadow = focused
    ? isLocalError || isAvailabilityError
      ? 'shadow-[0_0_0_3px_rgba(213,11,11,0.18)]'
      : availability === 'available'
        ? 'shadow-[0_0_0_3px_rgba(60,193,78,0.18)]'
        : 'shadow-[var(--shadow-focus-ring)]'
    : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-handle-title"
      data-testid="username-change-modal"
      className={scrimClass}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      {isSuccess ? (
        // ─── HandleChangedModal — 460px confirmation card ────────────────
        <div
          data-testid="username-change-modal-success"
          className="w-full max-w-[460px] overflow-hidden rounded-lg border border-border-subtle bg-surface-card text-center shadow-[var(--shadow-modal)]"
        >
          <div className="px-8 pt-9 pb-7">
            <div
              aria-hidden="true"
              className="mx-auto mb-[18px] flex h-11 w-11 items-center justify-center rounded-full border border-success-border bg-success-bg text-success-fg"
            >
              <Icon name="check" size={20} />
            </div>

            <div
              id="change-handle-title"
              className="mb-3.5 font-mono text-[11px] tracking-[0.14em] uppercase text-fg-secondary"
            >
              HANDLE CHANGED
            </div>

            <div className="break-all font-serif text-[22px] leading-[1.15] tracking-[-0.005em] text-fg-primary">
              {successHandle}
            </div>

            <p className="mx-auto mt-3.5 max-w-[320px] text-[13px] leading-[1.55] text-fg-secondary">
              It can take a few seconds to propagate everywhere.
            </p>
          </div>

          <div className="flex justify-center border-t border-border-subtle py-3.5">
            <button
              type="button"
              onClick={onClose}
              data-testid="username-change-modal-done"
              className="rounded-sm border border-fg-primary bg-fg-primary px-4 py-2.5 font-mono text-[11px] tracking-[0.1em] uppercase text-fg-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              DONE
            </button>
          </div>
        </div>
      ) : (
        // ─── ChangeHandleModal — 520px form card ─────────────────────────
        <div
          className="w-full max-w-[520px] overflow-hidden rounded-lg border border-border-subtle bg-surface-card shadow-[var(--shadow-modal)]"
        >
          {/* Mono header strip */}
          <div className="flex items-center justify-between border-b border-border-subtle px-[18px] py-3.5">
            <span
              id="change-handle-title"
              className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-primary"
            >
              {'// CHANGE HANDLE'}
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close"
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted transition hover:bg-surface-sunken hover:text-fg-primary disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              <Icon name="close" size={12} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5">
            {/* Current */}
            <div className="mb-[18px]">
              <div className="mb-1.5 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
                CURRENT
              </div>
              <div className="rounded-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-mono text-[14px] text-fg-secondary">
                {currentLabel}
                <span className="text-fg-muted">{PARENT_SUFFIX}</span>
              </div>
            </div>

            {/* New handle */}
            <div>
              <label
                htmlFor={inputId}
                className="mb-1.5 block font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted"
              >
                NEW HANDLE
              </label>
              <div
                className={`flex items-center rounded-xs bg-surface-card transition border ${inputBorderClass} ${inputShadow} px-3 py-0.5`}
              >
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setSubmitError(null);
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  disabled={isSubmitting}
                  placeholder="alice"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={20}
                  aria-describedby={helpId}
                  aria-invalid={validation.status !== 'idle' && validation.status !== 'ok' || undefined}
                  className="flex-1 min-w-0 px-1 py-2.5 font-mono text-[14px] text-fg-primary bg-transparent border-none outline-none placeholder:text-fg-muted disabled:opacity-50"
                />
                <span className="font-mono text-[14px] text-fg-muted pr-1">{PARENT_SUFFIX}</span>
              </div>

              {/* [S18-F18] Status line — submit error first, then local
                  validation errors, then live availability state. The
                  availability tier only renders when local validation
                  passes (validation.status === 'ok'). */}
              <p
                id={helpId}
                role={submitError || validation.hint || isAvailabilityError ? 'alert' : 'status'}
                className={`mt-2 inline-flex items-start gap-1.5 font-mono text-[11px] tracking-[0.04em] uppercase ${
                  submitError || isLocalError || isAvailabilityError
                    ? 'text-error-fg'
                    : availability === 'available'
                      ? 'text-success-fg'
                      : 'text-fg-muted'
                }`}
              >
                {submitError ? (
                  <>
                    <Icon name="close" size={10} aria-hidden />
                    <span>{submitError}</span>
                  </>
                ) : isLocalError && validation.hint ? (
                  <>
                    <Icon name="close" size={10} aria-hidden />
                    <span>{validation.hint}</span>
                  </>
                ) : validation.status === 'idle' ? (
                  <span>{'// 3–20 CHARS · LOWERCASE, DIGITS, HYPHEN'}</span>
                ) : availability === 'checking' ? (
                  <>
                    <Icon name="spinner" size={10} aria-hidden className="animate-spin" />
                    <span>{'// CHECKING'}</span>
                  </>
                ) : availability === 'available' ? (
                  <>
                    <Icon name="check" size={10} aria-hidden />
                    <span>{'// AVAILABLE'}</span>
                  </>
                ) : availability === 'taken' ? (
                  <>
                    <Icon name="close" size={10} aria-hidden />
                    <span>{`// TAKEN — ${validation.label}${PARENT_SUFFIX} is already claimed`}</span>
                  </>
                ) : availability === 'verifier-down' ? (
                  <>
                    <Icon name="close" size={10} aria-hidden />
                    <span>{"// VERIFIER DOWN — can't check right now, try again"}</span>
                  </>
                ) : availability === 'error' ? (
                  <>
                    <Icon name="close" size={10} aria-hidden />
                    <span>{'// CHECK FAILED — try again'}</span>
                  </>
                ) : (
                  <span>{'// 3–20 CHARS · LOWERCASE, DIGITS, HYPHEN'}</span>
                )}
              </p>
            </div>

            {/* Warning callout */}
            <div className="mt-[18px] flex items-start gap-2 rounded-sm border border-warning-border bg-warning-bg px-3 py-2.5">
              <span
                aria-hidden="true"
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-solid"
              />
              <p className="text-[12.5px] leading-[1.5] text-warning-fg">
                Changing your handle releases <span className="font-mono">{currentFull}</span> on Sui.
                Anyone can claim it after — including someone else.{' '}
                <strong className="font-semibold">This action is final.</strong>
              </p>
            </div>

            {/* Actions */}
            <div className="mt-[22px] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-sm border border-border-subtle bg-surface-card px-4 py-2.5 font-mono text-[11px] tracking-[0.08em] uppercase text-fg-primary transition hover:border-border-strong disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                /* [S18-F18] Submit unlocks only when local validation passes
                   AND the live check confirmed the handle is available
                   (verifier-down is permitted — server has its own gate
                   per S18-F15). */
                disabled={
                  !validation.ok ||
                  isSubmitting ||
                  availability === 'checking' ||
                  availability === 'taken' ||
                  availability === 'error' ||
                  availability === 'idle'
                }
                data-testid="username-change-modal-submit"
                className="rounded-sm border border-fg-primary bg-fg-primary px-4 py-2.5 font-mono text-[11px] tracking-[0.1em] uppercase text-fg-inverse transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                {isSubmitting ? 'Changing…' : 'CHANGE HANDLE'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function reasonToCopy(
  reason: ChangeError['reason'] | 'invalid' | 'too-short' | 'too-long' | 'reserved' | 'unchanged',
  label: string,
): string {
  const fullHandle = `${label}${PARENT_SUFFIX}`;
  switch (reason) {
    case 'taken':
      return `${fullHandle} is already claimed — try a different name.`;
    case 'reserved':
      return `${fullHandle} is reserved — try a different name.`;
    case 'invalid':
      return 'Letters, numbers, and hyphens only — no leading or trailing hyphens.';
    case 'too-short':
      return 'Handles need at least 3 characters.';
    case 'too-long':
      return 'Handles can be at most 20 characters.';
    case 'unchanged':
      return `That's your current handle — pick something different.`;
    case 'verifier-down':
      return "Couldn't verify the name on Sui right now — please try again in a moment.";
    case 'rate-limit':
      return 'Too many change attempts — please wait before trying again.';
    case 'unknown':
    default:
      return 'Could not change the handle — please try again.';
  }
}
