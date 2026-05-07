'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { suggestUsernames } from '@/lib/identity/suggest-usernames';
import { validateAudricLabel, type LabelReason } from '@/lib/identity/validate-label';
import { fetchIdentityCheck } from '@/lib/identity/check-fetcher';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 10 Phase B.1 — UsernamePicker
//
// [B6 design pass] Complete visual rewrite to the V2 ("terminal /
// editorial") layout from the username-flow design handoff bundle
// (`design_handoff_username_flow/handle-picker.jsx` → <V2/>). Layout
// reference: the same handoff's README.md §A1.
//
// Key visual structure (top → bottom inside a 540px sunken card):
//   • Mono header strip — `// PASSPORT / HANDLE` left-aligned, hairline.
//     The handoff includes a `STEP 02 — 04` right counter; we drop it
//     because audric's signup is one-step — see S.87 tracker entry for
//     the rationale.
//   • Serif H2 "Pick your handle" + sans subtitle with inline mono
//     `@yourhandle` code chip.
//   • `// SUGGESTED` mono section label + "↻ Regenerate" mono button.
//   • Bordered terminal-row table — one row per suggestion, mono handle
//     left, AVAILABLE/TAKEN status tag right. Active (clicked) row gets
//     a sunken-bg highlight. Taken rows are line-through + non-clickable.
//   • `// CUSTOM` mono section label + the @label.audric.sui input shell.
//     Border + focus shadow tint on validation state (red on bad, green
//     on ok, blue on focus).
//   • Status line (mono UPPERCASE, // prefix) — `// AVAILABLE — …` /
//     `// TAKEN — …` / `// 3–20 CHARS · A-Z, 0-9, hyphen` for the
//     idle hint.
//   • Dither rule (`░▒▓` Departure-Mono pattern in border-subtle).
//   • Footer — `← SKIP FOR NOW` mono link (left, only when onSkip
//     provided), `CLAIM HANDLE →` mono primary CTA (right).
//
// Validation: lowercased + trimmed input, then `validateAudricLabel`
// (matches the SuiNS protocol invariant: lowercase alphanumeric +
// hyphen, no leading/trailing/consecutive hyphens, length 3–20). The
// handoff README says `^[a-z0-9_]{3,20}$` (underscores) but underscores
// are not a valid SuiNS leaf character — minting would fail at the
// on-chain layer. The picker MUST mirror the on-chain charset, so
// hyphens-only is the correct rule here. See S.87 entry.
//
// Composition contract is unchanged from the original B.1 ship —
// `googleName` / `googleEmail` / `onSubmit(label)` / optional
// `onSkip()` / `disabled` / `checkFetcher` (test injection).
// ───────────────────────────────────────────────────────────────────────────

// [S.118 / 2026-05-08] Display form switched from `.audric.sui` (full
// on-chain handle) to `@audric` (SuiNS V2 short-form alias). Both
// resolve to the same address via SuiNS RPC — this is purely a
// render-layer choice. The on-chain NFT name is still
// `<label>.audric.sui` (see `lib/identity/reserve` route + the SDK's
// `fullHandle()`); only display-side strings flip to the @ form.
const PARENT_SUFFIX = '@audric';
const PARENT_SUFFIX_ONCHAIN = '.audric.sui'; // kept for ARIA labels referencing the on-chain object
const DEBOUNCE_MS = 300;
const DITHER_PATTERN = '░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░▒▓▒░░';

export type UsernameCheckStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  | 'reserved'
  | 'invalid'
  | 'too-short'
  | 'too-long'
  | 'verifier-down'
  | 'error';

export interface UsernamePickerProps {
  googleName?: string | null;
  googleEmail?: string | null;
  onSubmit: (label: string) => void;
  onSkip?: () => void;
  disabled?: boolean;
  checkFetcher?: (label: string) => Promise<UsernameCheckResult>;
}

export interface UsernameCheckResult {
  available: boolean;
  reason?: LabelReason | 'reserved' | 'taken';
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
  const [seed, setSeed] = useState(0);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<UsernameCheckStatus>('idle');
  const [rowStatus, setRowStatus] = useState<Record<string, UsernameCheckStatus>>({});
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(
    () => suggestUsernames({ googleName, googleEmail, seed, count: 3 }),
    [googleName, googleEmail, seed],
  );

  // ─── Per-suggestion availability pre-check ────────────────────────────
  useEffect(() => {
    if (suggestions.length === 0) {
      setRowStatus({});
      return;
    }

    let cancelled = false;
    const initial: Record<string, UsernameCheckStatus> = {};
    for (const s of suggestions) initial[s] = 'checking';
    setRowStatus(initial);

    Promise.all(
      suggestions.map((label) =>
        checkFetcher(label)
          .then((r) => ({ label, status: resultToStatus(r) }))
          .catch(() => ({ label, status: 'error' as UsernameCheckStatus })),
      ),
    ).then((results) => {
      if (cancelled) return;
      setRowStatus((prev) => {
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
  const checkIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifiedFromRowRef = useRef<string | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (input === '') {
      setStatus('idle');
      return;
    }

    if (verifiedFromRowRef.current === input) return;

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
          if (checkIdRef.current !== id) return;
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

  const handleRowClick = useCallback(
    (label: string) => {
      const s = rowStatus[label];
      if (s === 'available') {
        verifiedFromRowRef.current = label;
        setInput(label);
        checkIdRef.current += 1;
        setStatus('available');
      }
    },
    [rowStatus],
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

  // Tests assert `submit.textContent === 'Claiming…'` when disabled —
  // keep that literal. The rest of the CTA copy is the V2 mono primary.
  const submitLabel = disabled ? 'Claiming…' : 'CLAIM HANDLE →';
  const canSubmit = status === 'available' && !disabled;

  const inputBorderClass = (() => {
    if (
      status === 'taken' ||
      status === 'invalid' ||
      status === 'too-long' ||
      status === 'reserved'
    ) {
      return 'border-error-border';
    }
    if (status === 'available') return 'border-success-border';
    if (focused) return 'border-border-focus';
    return 'border-border-subtle';
  })();
  const inputShadow = focused
    ? status === 'taken' ||
      status === 'invalid' ||
      status === 'too-long' ||
      status === 'reserved'
      ? 'shadow-[0_0_0_3px_rgba(213,11,11,0.18)]'
      : status === 'available'
        ? 'shadow-[0_0_0_3px_rgba(60,193,78,0.18)]'
        : 'shadow-[var(--shadow-focus-ring)]'
    : '';

  return (
    <div
      data-testid="username-picker"
      className="rounded-lg border border-border-subtle bg-surface-card pt-6 pb-6 px-7"
    >
      {/* Mono header strip — `// PASSPORT / HANDLE` left, no step counter
          (S.87 — audric signup is single-step; literal step copy would lie). */}
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-fg-primary">
          {'// PASSPORT / HANDLE'}
        </span>
      </div>

      {/* Title + subtitle */}
      <div className="mt-[22px] mb-[22px]">
        <h2 className="font-serif text-[36px] leading-[42px] tracking-[-0.01em] font-medium text-fg-primary m-0">
          Pick your handle
        </h2>
        <p className="mt-[10px] mb-0 max-w-[460px] text-[14px] leading-[20px] text-fg-secondary">
          This is your forever Audric Passport — friends send you USDC by typing{' '}
          <code className="font-mono text-[13px] text-fg-primary bg-surface-sunken px-[5px] py-[1px] rounded-xs border border-border-subtle">
            @yourhandle
          </code>
          .
        </p>
      </div>

      {/* SUGGESTED row label + regenerate */}
      {suggestions.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
              {'// SUGGESTED'}
            </span>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={disabled}
              data-testid="username-picker-regenerate"
              aria-label="Regenerate suggestions"
              className="inline-flex items-center gap-1.5 px-1.5 py-1 font-mono text-[10px] tracking-[0.08em] uppercase text-fg-secondary transition hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
            >
              <Icon name="sparkle" size={11} />
              Regenerate
            </button>
          </div>

          {/* Bordered terminal-row table */}
          <div
            role="group"
            aria-label="Username suggestions"
            className="flex flex-col mb-[22px] rounded-sm border border-border-subtle overflow-hidden"
          >
            {suggestions.map((label, i) => (
              <SuggestionRow
                key={label}
                label={label}
                status={rowStatus[label] ?? 'checking'}
                divider={i < suggestions.length - 1}
                disabled={disabled}
                active={input === label && status === 'available'}
                onClick={() => handleRowClick(label)}
              />
            ))}
          </div>
        </>
      )}

      {/* CUSTOM label */}
      <div className="mb-1.5">
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          {'// CUSTOM'}
        </span>
      </div>

      {/* Input shell */}
      <form onSubmit={handleSubmit}>
        <div
          className={`flex items-center gap-0 rounded-xs bg-surface-card transition border ${inputBorderClass} ${inputShadow} px-3 py-0.5`}
        >
          <span className="font-mono text-[13px] text-fg-muted">@</span>
          <input
            id="username-picker-input"
            data-testid="username-picker-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.trim().toLowerCase())}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="yourhandle"
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            aria-describedby="username-picker-status"
            aria-invalid={isErrorStatus(status) || undefined}
            className="flex-1 px-1 py-2.5 font-mono text-[13px] text-fg-primary bg-transparent border-none outline-none disabled:opacity-50"
          />
          <span className="font-mono text-[13px] text-fg-muted pr-2">{PARENT_SUFFIX}</span>
        </div>

        {/* Status line */}
        <div className="h-[18px] mt-2">
          <StatusLine status={status} input={input} />
        </div>

        {/* Dither rule */}
        <div
          aria-hidden="true"
          className="font-mono text-[12px] tracking-[0.05em] text-border-subtle mt-[22px] mb-3.5 overflow-hidden whitespace-nowrap select-none"
        >
          {DITHER_PATTERN}
        </div>

        {/* Footer — Skip / Claim */}
        <div className="flex items-center justify-between">
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={disabled}
              data-testid="username-picker-skip"
              className="font-mono text-[11px] tracking-[0.08em] uppercase text-fg-secondary py-1.5 transition hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:underline underline-offset-[3px]"
            >
              ← SKIP FOR NOW
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            data-testid="username-picker-submit"
            className="inline-flex items-center justify-center rounded-xs border border-fg-primary bg-fg-primary px-[18px] py-3 font-mono text-[11px] tracking-[0.1em] uppercase text-fg-inverse transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
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

interface SuggestionRowProps {
  label: string;
  status: UsernameCheckStatus;
  divider: boolean;
  disabled: boolean;
  active: boolean;
  onClick: () => void;
}

function SuggestionRow({ label, status, divider, disabled, active, onClick }: SuggestionRowProps) {
  // Defensive — the suggester emits valid labels, but if a sync rule
  // ever fires here we'd render a half-drawn row. Skipping is cleaner.
  if (status === 'invalid' || status === 'too-short' || status === 'too-long') {
    return null;
  }

  const ok = status === 'available';
  const taken = status === 'taken' || status === 'reserved';
  const checking = status === 'checking';
  const errored = status === 'error' || status === 'verifier-down';
  const clickable = ok && !disabled;

  const tagTone = ok
    ? 'bg-success-bg text-success-fg'
    : taken || errored
      ? 'bg-error-bg text-error-fg'
      : 'bg-surface-sunken text-fg-muted';
  const tagText = ok
    ? 'AVAILABLE'
    : taken
      ? 'TAKEN'
      : errored
        ? 'CHECK FAILED'
        : 'CHECKING…';
  const tagIconName: 'check' | 'close' | 'spinner' = ok ? 'check' : checking ? 'spinner' : 'close';

  const handleTextClass = taken ? 'text-fg-muted line-through' : 'text-fg-primary';

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      data-testid={`username-picker-chip-${label}`}
      data-status={status}
      aria-label={`${label}@audric — ${humanStatus(status)}`}
      className={`flex items-center justify-between text-left w-full px-3.5 py-3 transition ${
        divider ? 'border-b border-border-subtle' : ''
      } ${active ? 'bg-surface-sunken' : 'bg-transparent'} ${
        clickable ? 'cursor-pointer hover:bg-surface-sunken' : 'cursor-not-allowed'
      } focus-visible:outline-none focus-visible:bg-surface-sunken`}
    >
      <span className={`font-mono text-[13px] ${handleTextClass}`}>
        {label}
        <span className="text-fg-muted">{PARENT_SUFFIX}</span>
      </span>
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs font-mono text-[10px] tracking-[0.08em] uppercase ${tagTone}`}
      >
        <Icon
          name={tagIconName}
          size={10}
          className={tagIconName === 'spinner' ? 'animate-spin' : undefined}
        />
        {tagText}
      </span>
    </button>
  );
}

interface StatusLineProps {
  status: UsernameCheckStatus;
  input: string;
}

function StatusLine({ status, input }: StatusLineProps) {
  if (status === 'idle' || input === '') {
    return (
      <div
        id="username-picker-status"
        data-testid="username-picker-status"
        data-status="idle"
        className="font-mono text-[11px] tracking-[0.04em] text-fg-muted"
      >
        {'// 3–20 CHARS · A-Z, 0-9, HYPHEN'}
      </div>
    );
  }

  const message = humanStatusForInput(status, input);
  const tone = isErrorStatus(status)
    ? 'text-error-fg'
    : status === 'available'
      ? 'text-success-fg'
      : 'text-fg-muted';
  const prefix = humanStatusPrefix(status);
  const iconName: 'check' | 'close' | 'spinner' =
    status === 'available' ? 'check' : isErrorStatus(status) ? 'close' : 'spinner';

  return (
    <div
      id="username-picker-status"
      data-testid="username-picker-status"
      data-status={status}
      role={isErrorStatus(status) ? 'alert' : 'status'}
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.04em] uppercase ${tone}`}
    >
      <Icon
        name={iconName}
        size={10}
        className={iconName === 'spinner' && status === 'checking' ? 'animate-spin' : undefined}
      />
      <span>
        {prefix}
        {message ? ` — ${message}` : ''}
      </span>
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

function humanStatusPrefix(s: UsernameCheckStatus): string {
  switch (s) {
    case 'available':
      return '// AVAILABLE';
    case 'checking':
      return '// CHECKING';
    case 'taken':
      return '// TAKEN';
    case 'reserved':
      return '// RESERVED';
    case 'invalid':
      return '// INVALID';
    case 'too-short':
      return '// TOO SHORT';
    case 'too-long':
      return '// TOO LONG';
    case 'verifier-down':
      return '// VERIFIER DOWN';
    case 'error':
      return '// CHECK FAILED';
    default:
      return '';
  }
}

function humanStatusForInput(s: UsernameCheckStatus, input: string): string {
  if (s === 'idle' || input === '') return '';
  if (s === 'checking') return 'one moment';
  if (s === 'available') return `${input}@audric is yours to claim`;
  if (s === 'taken') return `${input}@audric is taken — try another`;
  if (s === 'reserved') return `${input} is reserved`;
  if (s === 'too-short') return 'handles need 3 characters minimum';
  if (s === 'too-long') return 'handles can be 20 characters maximum';
  if (s === 'invalid') return 'use lowercase letters, numbers, hyphens';
  if (s === 'verifier-down') return "can't verify availability right now — try again in a moment";
  return 'check failed — try again';
}

// ───────────────────────────────────────────────────────────────────────────
// Default fetcher — wraps GET /api/identity/check.
// ───────────────────────────────────────────────────────────────────────────

async function defaultCheckFetcher(label: string): Promise<UsernameCheckResult> {
  // [S18-F19] HTTP-status mapping (incl. 503 + 429 → verifierDown) is
  // owned by `lib/identity/check-fetcher.ts` so the picker and the
  // settings change-handle modal stay aligned.
  const r = await fetchIdentityCheck(label);
  return {
    available: r.available,
    reason: r.reason as UsernameCheckResult['reason'],
    verifierDown: r.verifierDown,
  };
}
