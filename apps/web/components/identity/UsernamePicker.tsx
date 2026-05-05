'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { suggestUsernames } from '@/lib/identity/suggest-usernames';
import { validateAudricLabel, type LabelReason } from '@/lib/identity/validate-label';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 10 Phase B.1 — UsernamePicker
//
// Reusable component that lets a user claim a `username.audric.sui` leaf
// subname. Built on the SPEC 9 P9.4 `pending_input` SUBSTRATE (same SSE
// lifecycle: engine emits → host renders → user submits → resume route)
// but with a SPECIALIZED renderer rather than the generic `PendingInputForm`
// because the picker has UX requirements that the generic form can't model:
//
//   • 3 chip suggestions with per-chip availability state
//   • 🔄 "regenerate suggestions" button (B-6 privacy escape hatch)
//   • Real-time debounced availability check on the free-text input
//   • Status-specific copy: available / taken / reserved / invalid /
//     too-short / too-long / checking / verifier-degraded (503)
//   • Static `.audric.sui` suffix rendered as a separate, non-editable
//     element in the input (SuiNS suffix is fixed for the audric brand)
//
// Composition contract:
//
//   This component is a PURE UI primitive — it doesn't know about engine
//   sessions, JWTs, or transaction signing. The caller (signup page,
//   chat-timeline pending_input renderer, settings/contacts CRUD) is
//   responsible for:
//
//     • Wiring `googleName` + `googleEmail` from the auth source.
//     • Handling the `onSubmit(label)` callback (kicks off the leaf-mint
//       flow — see Phase B.2 leaf-mint route).
//     • Optionally handling `onSkip()` (D2 escape hatch — claim later
//       from settings).
//
// Validation defense-in-depth:
//
//   The picker pre-validates client-side (validateAudricLabel) and pre-
//   checks availability (GET /api/identity/check). Both are UX-only —
//   the leaf-mint route in B.2 re-runs the same validation server-side
//   with anti-race re-check. The picker's `onSubmit` only fires when
//   the input passes BOTH validation AND availability — but the caller
//   MUST NOT trust this gate (defense in depth: a B.2 race could still
//   reject the submission if another user claimed the same name in the
//   ~200ms between check and mint).
// ───────────────────────────────────────────────────────────────────────────

const PARENT_SUFFIX = '.audric.sui';
const DEBOUNCE_MS = 300;

export type UsernameCheckStatus =
  | 'idle'         // empty input, no chip selected
  | 'checking'     // /api/identity/check in flight
  | 'available'    // confirmed available — submit enabled
  | 'taken'        // someone has it
  | 'reserved'     // brand / system / squat-magnet
  | 'invalid'      // charset or hyphen rule failure
  | 'too-short'    // < 3 chars
  | 'too-long'     // > 20 chars
  | 'verifier-down' // 503 from /api/identity/check (RPC degraded)
  | 'error';       // network failure

export interface UsernamePickerProps {
  /** Google `name` claim — used to derive smart pre-fill suggestions. */
  googleName?: string | null;
  /** Google `email` claim — used to derive smart pre-fill suggestions. */
  googleEmail?: string | null;
  /**
   * Called when the user clicks Submit on a confirmed-available label.
   * The label is the canonical lowercased form (no `.audric.sui` suffix).
   * Caller should kick off the leaf-mint flow — the picker does not
   * persist anything itself.
   */
  onSubmit: (label: string) => void;
  /**
   * Optional escape-hatch handler. When present, renders a "Skip for
   * now" link below the submit button. The signup flow can call this
   * to defer claiming to the settings page (per SPEC 10 D2).
   */
  onSkip?: () => void;
  /**
   * Mute the entire UI while the parent is processing (e.g. mint tx in
   * flight). Inputs become read-only; submit shows "Claiming…".
   */
  disabled?: boolean;
  /**
   * Optional fetcher injection — for tests. Defaults to the global
   * `fetch`. The signature matches `/api/identity/check?username=…`
   * (200 with `{available, reason?}` body, 429 / 503 surface as
   * `verifier-down` / `error`).
   */
  checkFetcher?: (label: string) => Promise<UsernameCheckResult>;
}

export interface UsernameCheckResult {
  available: boolean;
  reason?: LabelReason | 'reserved' | 'taken';
  /** Set when the verifier returned 503 — picker shows a retry hint. */
  verifierDown?: boolean;
}

export function UsernamePicker({
  googleName,
  googleEmail,
  onSubmit,
  onSkip,
  disabled = false,
  checkFetcher = defaultCheckFetcher,
}: UsernamePickerProps) {
  // [Suggestion seed] Increments on 🔄 regenerate. Each seed yields a
  // different slice of 3 candidates from the deterministic strategy list.
  const [seed, setSeed] = useState(0);

  // [Free-text input] Lowercased + trimmed live so the visible value
  // matches what gets submitted (no surprise normalization on submit).
  const [input, setInput] = useState('');

  // [Check status for the free-text input] Updates as the debounced
  // /api/identity/check call resolves. Distinct from per-chip status
  // (which tracks the 3 suggestion chips independently).
  const [status, setStatus] = useState<UsernameCheckStatus>('idle');

  // [Per-chip status] Map of chip-label → status. Each chip checks its
  // own availability when the picker mounts (or when seed advances).
  // Chips render their own spinner / ✓ / ✗ icon based on this state.
  const [chipStatus, setChipStatus] = useState<Record<string, UsernameCheckStatus>>({});

  // [Strategy slice] Deterministic per (name, email, seed). Memo'd to
  // avoid reshuffling on unrelated re-renders.
  const suggestions = useMemo(
    () => suggestUsernames({ googleName, googleEmail, seed, count: 3 }),
    [googleName, googleEmail, seed],
  );

  // ─── Per-chip availability pre-check ──────────────────────────────────
  // When suggestions change (mount or regenerate), fire 3 parallel
  // /api/identity/check calls. Track in chipStatus. Stale-closure-safe
  // via the local `cancelled` flag in the effect cleanup.
  useEffect(() => {
    if (suggestions.length === 0) {
      setChipStatus({});
      return;
    }

    let cancelled = false;
    const initial: Record<string, UsernameCheckStatus> = {};
    for (const s of suggestions) initial[s] = 'checking';
    setChipStatus(initial);

    Promise.all(
      suggestions.map((label) =>
        checkFetcher(label)
          .then((r) => ({ label, status: resultToStatus(r) }))
          .catch(() => ({ label, status: 'error' as UsernameCheckStatus })),
      ),
    ).then((results) => {
      if (cancelled) return;
      setChipStatus((prev) => {
        const next = { ...prev };
        for (const { label, status: s } of results) next[label] = s;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [suggestions, checkFetcher]);

  // ─── Debounced free-text availability check ───────────────────────────
  // Cancels the previous in-flight check by tracking the latest invocation
  // ID — when the request resolves we only commit the result if it's the
  // most recent one (avoids out-of-order responses showing "available"
  // for a label the user has already deleted).
  const checkIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // [Chip-click suppression] When a user clicks an already-verified chip
  // we set this ref to that label. The next input-effect tick sees the
  // input now matches the suppressed label and skips the redundant
  // validate+fetch, leaving the explicitly-set 'available' status intact.
  // The moment the user types over the chip-filled value, `input` no
  // longer matches the ref and the normal check resumes.
  const verifiedFromChipRef = useRef<string | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (input === '') {
      setStatus('idle');
      return;
    }

    // [Chip-verified short-circuit] The chip pre-check already proved this
    // exact label is available; don't re-check on the input-edit path.
    if (verifiedFromChipRef.current === input) {
      return;
    }

    // [Sync validation gate] Cheap client-side validation gives instant
    // feedback for too-short / invalid / too-long without burning a
    // network call. /api/identity/check would return the same reason
    // anyway — this just removes the debounce-wait latency for the
    // common "user typed a hyphen" case.
    const validation = validateAudricLabel(input);
    if (!validation.valid) {
      setStatus(validation.reason);
      return;
    }

    setStatus('checking');
    const id = ++checkIdRef.current;

    debounceTimerRef.current = setTimeout(() => {
      checkFetcher(validation.label)
        .then((r) => {
          if (checkIdRef.current !== id) return; // out-of-order — discard
          setStatus(resultToStatus(r));
        })
        .catch(() => {
          if (checkIdRef.current !== id) return;
          setStatus('error');
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [input, checkFetcher]);

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleChipClick = useCallback(
    (label: string) => {
      const s = chipStatus[label];
      if (s === 'available') {
        // Fill the input + commit status so submit is immediately enabled.
        // The verifiedFromChipRef tells the input-watching effect to skip
        // re-checking this label (we already verified it via the chip
        // pre-check) — without it we'd flash "checking…" for ~300ms.
        verifiedFromChipRef.current = label;
        setInput(label);
        checkIdRef.current += 1; // invalidate any in-flight free-text check
        setStatus('available');
      }
      // Other statuses are no-ops — the chip is already disabled by aria
      // and visual styles, but defense-in-depth.
    },
    [chipStatus],
  );

  const handleRegenerate = useCallback(() => {
    setSeed((prev) => prev + 1);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (status !== 'available') return;
      const validation = validateAudricLabel(input);
      if (!validation.valid) return;
      onSubmit(validation.label);
    },
    [input, status, onSubmit],
  );

  // ─── Render ───────────────────────────────────────────────────────────

  const submitLabel = disabled ? 'Claiming…' : 'Claim handle';
  const canSubmit = status === 'available' && !disabled;

  return (
    <div
      data-testid="username-picker"
      className="space-y-4 rounded-lg border border-border-subtle bg-surface-page/40 p-4"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-fg-primary">Pick your handle</h3>
        <p className="text-[12px] text-fg-secondary">
          This is your forever Audric Passport — friends send you USDC by typing
          {' '}
          <span className="font-mono text-fg-primary">@yourhandle</span>.
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-fg-secondary">
              Suggestions
            </span>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={disabled}
              data-testid="username-picker-regenerate"
              aria-label="Regenerate suggestions"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-secondary transition-colors hover:bg-surface-page hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true">🔄</span>
              <span>Regenerate</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Username suggestions">
            {suggestions.map((label) => (
              <SuggestionChip
                key={label}
                label={label}
                status={chipStatus[label] ?? 'checking'}
                disabled={disabled}
                onClick={() => handleChipClick(label)}
              />
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="username-picker-input" className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-fg-secondary">
            Or type your own
          </span>
        </label>
        <div className="flex items-stretch overflow-hidden rounded-md border border-border-subtle bg-surface-page focus-within:border-border-strong">
          <input
            id="username-picker-input"
            data-testid="username-picker-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.trim().toLowerCase())}
            placeholder="alice"
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            aria-describedby="username-picker-status"
            aria-invalid={isErrorStatus(status) || undefined}
            className="flex-1 bg-transparent px-3 py-2 font-mono text-sm text-fg-primary outline-none disabled:opacity-50"
          />
          <span
            aria-hidden="true"
            className="flex items-center bg-surface-page/60 px-3 font-mono text-sm text-fg-secondary"
          >
            {PARENT_SUFFIX}
          </span>
        </div>
        <StatusLine status={status} input={input} />

        <div className="flex items-center justify-between gap-3 pt-1">
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={disabled}
              data-testid="username-picker-skip"
              className="text-[12px] text-fg-secondary underline-offset-2 hover:text-fg-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Skip for now
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            data-testid="username-picker-submit"
            className="inline-flex items-center justify-center rounded-md border border-border-strong bg-fg-primary px-4 py-2 text-[12px] font-medium text-fg-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────────

interface SuggestionChipProps {
  label: string;
  status: UsernameCheckStatus;
  disabled: boolean;
  onClick: () => void;
}

function SuggestionChip({ label, status, disabled, onClick }: SuggestionChipProps) {
  // Chips can be in 4 visual states:
  //   • checking → grey border, spinner suffix
  //   • available → green tint, ✓ suffix, clickable
  //   • taken/reserved/error → red tint, ✗ suffix, disabled
  //   • invalid (shouldn't happen post-validation but defensive) → hidden
  if (status === 'invalid' || status === 'too-short' || status === 'too-long') {
    return null;
  }
  const clickable = status === 'available' && !disabled;
  const indicator = chipIndicator(status);
  const tone = chipTone(status);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      data-testid={`username-picker-chip-${label}`}
      data-status={status}
      aria-label={`${label}.audric.sui — ${humanStatus(status)}`}
      className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-mono transition-colors ${tone} ${clickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="opacity-70">
        .audric.sui
      </span>
      <span aria-hidden="true" className="ml-0.5">
        {indicator}
      </span>
    </button>
  );
}

interface StatusLineProps {
  status: UsernameCheckStatus;
  input: string;
}

function StatusLine({ status, input }: StatusLineProps) {
  const message = humanStatusForInput(status, input);
  if (!message) {
    return <div id="username-picker-status" className="h-4" aria-hidden="true" />;
  }
  // Semantic tokens (DS Rule 1): theme-flip via globals.css, never raw palette.
  const tone = isErrorStatus(status)
    ? 'text-error-fg'
    : status === 'available'
      ? 'text-success-fg'
      : 'text-fg-secondary';
  return (
    <div
      id="username-picker-status"
      data-testid="username-picker-status"
      data-status={status}
      role={isErrorStatus(status) ? 'alert' : 'status'}
      className={`text-[12px] ${tone}`}
    >
      {message}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function resultToStatus(r: UsernameCheckResult): UsernameCheckStatus {
  if (r.verifierDown) return 'verifier-down';
  if (r.available) return 'available';
  if (r.reason === 'reserved') return 'reserved';
  if (r.reason === 'taken') return 'taken';
  if (r.reason === 'too-short') return 'too-short';
  if (r.reason === 'too-long') return 'too-long';
  return 'invalid';
}

function isErrorStatus(s: UsernameCheckStatus): boolean {
  return (
    s === 'taken' ||
    s === 'reserved' ||
    s === 'invalid' ||
    s === 'too-short' ||
    s === 'too-long' ||
    s === 'verifier-down' ||
    s === 'error'
  );
}

function humanStatus(s: UsernameCheckStatus): string {
  switch (s) {
    case 'idle':
      return '';
    case 'checking':
      return 'checking…';
    case 'available':
      return 'available';
    case 'taken':
      return 'taken';
    case 'reserved':
      return 'reserved';
    case 'invalid':
      return 'invalid characters';
    case 'too-short':
      return 'too short (3 minimum)';
    case 'too-long':
      return 'too long (20 maximum)';
    case 'verifier-down':
      return 'verifier unavailable';
    case 'error':
      return 'check failed';
  }
}

function humanStatusForInput(s: UsernameCheckStatus, input: string): string {
  if (s === 'idle' || input === '') return '';
  if (s === 'checking') return 'Checking…';
  if (s === 'available') return `${input}.audric.sui is yours to claim`;
  if (s === 'taken') return `${input}.audric.sui is taken — try another`;
  if (s === 'reserved') return `${input} is reserved`;
  if (s === 'too-short') return 'Handles need 3 characters minimum';
  if (s === 'too-long') return 'Handles can be 20 characters maximum';
  if (s === 'invalid') return 'Use letters, numbers, and hyphens only';
  if (s === 'verifier-down') {
    return "Can't verify availability right now — try again in a moment";
  }
  return 'Check failed — try again';
}

function chipIndicator(s: UsernameCheckStatus): string {
  if (s === 'checking') return '…';
  if (s === 'available') return '✓';
  return '✗';
}

function chipTone(s: UsernameCheckStatus): string {
  // Semantic tokens (DS Rule 1): success-* / error-* theme-flip via globals.css.
  // The available chip's hover bumps opacity slightly via opacity-90 → opacity-100
  // pattern instead of a custom darker fill, since success-bg has different
  // values per theme (g200 solid in light, rgba 0.14 in dark) and a custom
  // hover fill would need to be defined per theme too.
  if (s === 'available') {
    return 'border-success-border bg-success-bg text-success-fg hover:opacity-90';
  }
  if (s === 'checking') {
    return 'border-border-subtle bg-surface-page/60 text-fg-secondary';
  }
  // taken / reserved / error
  return 'border-error-border bg-error-bg text-fg-secondary opacity-70';
}

// ───────────────────────────────────────────────────────────────────────────
// Default fetcher — wraps GET /api/identity/check.
//
// Test fixtures inject their own checkFetcher to avoid `fetch` mocks. The
// shape is the wire shape from `app/api/identity/check/route.ts`.
// ───────────────────────────────────────────────────────────────────────────

async function defaultCheckFetcher(label: string): Promise<UsernameCheckResult> {
  const res = await fetch(
    `/api/identity/check?username=${encodeURIComponent(label)}`,
    { method: 'GET' },
  );
  if (res.status === 503) {
    return { available: false, verifierDown: true };
  }
  if (!res.ok) {
    throw new Error(`identity-check ${res.status}`);
  }
  const body = (await res.json()) as { available: boolean; reason?: string };
  return {
    available: body.available,
    reason: body.reason as UsernameCheckResult['reason'],
  };
}
