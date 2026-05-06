'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { validateAudricLabel } from '@/lib/identity/validate-label';
import { isReserved } from '@/lib/identity/reserved-usernames';

// ───────────────────────────────────────────────────────────────────────────
// S.84 — UsernameChangeModal
//
// [B5 polish] Visual chrome aligned to the Audric Design System. Eyebrow
// tracking normalised to the canonical `0.1em` (was `0.12em` — minor
// drift from the original S.84 ship); close affordance switched to the
// canonical `Icon name="close"` for parity with every other dismissable
// surface. Reference: `design_handoff_audric/design_files/audric-app-light/
// settings.jsx` for the sunken-card chrome and mono-eyebrow language.
//
// Focused modal for the change-handle flow under Settings → Passport.
// Distinct from `<UsernameClaimGate>` (which owns the first-time claim
// machine for new signups). The change flow has different UX needs:
//
//   - User already has a handle — show it prominently as "current".
//   - The action is irreversible-ish on-chain (the old leaf is revoked
//     and someone else can grab it). Surface this as a warning, not
//     hidden in fine print.
//   - No smart pre-fill from Google name (the user has already chosen
//     a handle once — we don't need to suggest defaults).
//   - 3-state machine: idle → submitting → success(brief)→close.
//     Errors return to idle with an inline message + the typed input
//     preserved so the user can edit and retry.
//
// Composition contract:
//
//   The modal is presentation only — it doesn't own the open/close
//   state, the userStatus refetch, or the success transition. The
//   parent (PassportSection) is responsible for:
//     • Gating render on `open` (this modal short-circuits to null
//       when closed; no layout impact when hidden).
//     • Calling /api/identity/change with the submitted newLabel.
//     • Dispatching a userStatus refetch on success so the rest of
//       the app picks up the new handle (sidebar footer, greeting,
//       chat narration via system-prompt).
//     • Calling onClose() after the success window closes itself.
//
// Validation runs in two layers:
//
//   1. Pure (length / charset / reserved / unchanged) — synchronous,
//      drives the inline status line below the input.
//   2. Network (SuiNS RPC + DB unique pre-check + atomic PTB) — runs
//      inside the API route. Failures map to typed reason codes that
//      become user-visible copy via reasonToCopy().
//
// Why we don't pre-check on every keystroke (like the picker does):
//
//   The picker uses `/api/identity/check` to debounce-check availability
//   while the user types because the new-signup happy path benefits
//   from "this is taken" feedback BEFORE submit. The change flow is
//   higher-trust (the user has already navigated through Settings) and
//   the server does the pre-check anyway, so the keystroke chatter
//   isn't worth the extra rate-limit pressure on the check route.
// ───────────────────────────────────────────────────────────────────────────

const PARENT_SUFFIX = '.audric.sui';

type Phase = 'idle' | 'submitting' | 'success';

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
  /** Caller's Sui address — body of the POST. */
  address: string;
  /** zkLogin JWT — passed via `x-zklogin-jwt` header. */
  jwt: string;
  /** Caller's currently-claimed bare label (e.g. `'alice'`). */
  currentLabel: string;
  /**
   * Called after the success card closes itself (~1.2s post-success).
   * Parent should also have refetched userStatus by this point so the
   * rest of the app reflects the new handle.
   */
  onClose: () => void;
  /**
   * Fired when the API returns 200. Parent should refetch userStatus
   * here so the success card displays the new handle and downstream
   * surfaces (sidebar, greeting, chat) update on next render.
   */
  onChanged: (newLabel: string, fullHandle: string) => void;
  /** Optional fetcher injection for tests. */
  changeFetcher?: (newLabel: string) => Promise<ChangeSuccessBody>;
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
}: UsernameChangeModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [value, setValue] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successHandle, setSuccessHandle] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const helpId = useId();

  // Reset all state on open/close so a half-typed input doesn't bleed
  // into the next session.
  useEffect(() => {
    if (open) {
      setPhase('idle');
      setValue('');
      setSubmitError(null);
      setSuccessHandle(null);
      // Microtask delay so the modal mounts before focus call — without
      // it, autofocus loses to the modal's own mount-time focus reset.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  // Escape closes the modal (unless mid-submit, which would orphan the
  // request promise — let it land first).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'submitting') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, phase, onClose]);

  // Auto-close ~1.2s after success so the user sees the confirmation
  // moment but isn't stuck dismissing a modal manually.
  useEffect(() => {
    if (phase !== 'success') return;
    const t = setTimeout(() => onClose(), 1200);
    return () => clearTimeout(t);
  }, [phase, onClose]);

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

  // Synchronous validation drives the status line + the disabled state
  // on the submit button. Mirrors the picker's status-line semantics.
  const validation = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return { ok: false, hint: null as string | null, label: '' };
    }
    const v = validateAudricLabel(trimmed);
    if (!v.valid) {
      return { ok: false, hint: reasonToCopy(v.reason, trimmed), label: trimmed.toLowerCase() };
    }
    if (v.label === currentLabel) {
      return {
        ok: false,
        hint: `That's your current handle — pick something different.`,
        label: v.label,
      };
    }
    if (isReserved(v.label)) {
      return { ok: false, hint: reasonToCopy('reserved', v.label), label: v.label };
    }
    return { ok: true, hint: null as string | null, label: v.label };
  }, [value, currentLabel]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validation.ok || phase === 'submitting') return;
      setPhase('submitting');
      setSubmitError(null);
      try {
        const body = await fetcher(validation.label);
        setSuccessHandle(body.fullHandle);
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
    [validation, phase, fetcher, onChanged],
  );

  if (!open) return null;

  const currentFull = `${currentLabel}${PARENT_SUFFIX}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-handle-title"
      data-testid="username-change-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        // Click outside closes (unless submitting).
        if (e.target === e.currentTarget && phase !== 'submitting') onClose();
      }}
    >
      <div className="w-full max-w-[440px] rounded-md border border-border-strong bg-surface-page p-5 shadow-lg">
        {phase === 'success' && successHandle ? (
          <div
            data-testid="username-change-modal-success"
            className="flex flex-col items-center gap-3 py-4 text-center"
          >
            <div aria-hidden="true" className="text-2xl">
              🪪
            </div>
            <h2 id="change-handle-title" className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
              Handle changed
            </h2>
            <p className="break-all font-mono text-[15px] text-fg-primary">{successHandle}</p>
            <p className="text-[12px] text-fg-secondary">It can take a few seconds to propagate everywhere.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start justify-between">
              <h2
                id="change-handle-title"
                className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted"
              >
                Change handle
              </h2>
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'submitting'}
                aria-label="Close"
                className="-mt-1 -mr-1 inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted transition hover:bg-surface-sunken hover:text-fg-primary disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                <Icon name="close" size={12} aria-hidden />
              </button>
            </div>

            <div className="rounded-sm border border-border-subtle bg-surface-sunken p-3">
              <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
                Current
              </p>
              <p className="mt-1 break-all font-mono text-[13px] text-fg-primary">
                {currentFull}
              </p>
            </div>

            <div>
              <label
                htmlFor={inputId}
                className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted"
              >
                New handle
              </label>
              <div className="mt-1.5 flex items-center gap-1">
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setSubmitError(null);
                  }}
                  disabled={phase === 'submitting'}
                  placeholder="alice"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={20}
                  aria-describedby={helpId}
                  className="flex-1 min-w-0 rounded-sm border border-border-strong bg-surface-page px-2.5 py-2 font-mono text-[13px] text-fg-primary placeholder:text-fg-muted focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] disabled:opacity-50"
                />
                <span className="font-mono text-[13px] text-fg-secondary">{PARENT_SUFFIX}</span>
              </div>
              <p
                id={helpId}
                role={validation.hint || submitError ? 'alert' : undefined}
                className={[
                  'mt-1.5 text-[12px] leading-[1.5]',
                  submitError
                    ? 'text-error-fg'
                    : validation.hint
                      ? 'text-fg-secondary'
                      : 'text-fg-muted',
                ].join(' ')}
              >
                {submitError ?? validation.hint ?? '3–20 characters · lowercase letters, digits, hyphens'}
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-sm border border-warning-border bg-warning-bg px-3 py-2.5">
              <span
                aria-hidden="true"
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-solid"
              />
              <p className="text-[12px] leading-[1.55] text-warning-fg">
                Changing your handle releases <span className="font-mono">{currentFull}</span> on Sui.
                Anyone can claim it after — including someone else. This action is final.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'submitting'}
                className="rounded-sm border border-border-strong bg-transparent px-3 py-2 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary hover:bg-surface-sunken disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!validation.ok || phase === 'submitting'}
                data-testid="username-change-modal-submit"
                className="rounded-sm border border-fg-primary bg-fg-primary px-3 py-2 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-inverse hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                {phase === 'submitting' ? 'Changing…' : 'Change handle'}
              </button>
            </div>
          </form>
        )}
      </div>
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
