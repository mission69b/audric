'use client';

/**
 * SPEC 10 D.2 — Global username search bar.
 *
 * [B5 polish] Visual chrome aligned to the Audric Design System
 * (`.cursor/rules/design-system.mdc`). Row affordance labels ("Profile" /
 * "Balance") use the canonical mono-uppercase eyebrow language
 * (`font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted`) so
 * they sit on the same vertical rhythm as every other right-aligned
 * action label in the chrome (e.g. PassportSection's row CTAs). The
 * theme-flipping `bg-surface-nav` on the input is preserved (DS Rule 2)
 * so the field reads as "owned by the sidebar" in both themes. Reference
 * for the listbox row pattern:
 * `design_handoff_audric/design_files/audric-app-light/primitives.jsx`
 * (NavRow + Pill mono-uppercase patterns).
 *
 * Lives in `AppSidebar` (expanded state, just above the nav). Lets the
 * user jump to anyone's surface from anywhere in the app:
 *
 *   - Audric user (e.g. `alice` or `alice.audric.sui`) → navigates to
 *     `/[username]` (the public profile page from D.1)
 *   - Generic SuiNS (e.g. `alex.sui`) → fires a chat prompt via the
 *     parent's `onCheckBalance` callback ("Check balance for alex.sui")
 *   - 0x address → fires a chat prompt the same way
 *
 * Three concurrent data sources resolve in parallel as the user types:
 *   1. `/api/identity/search` — Audric directory prefix match (always)
 *   2. `/api/suins/resolve`  — generic SuiNS forward lookup (only when
 *      input ends in `.sui`)
 *   3. Local 0x parse        — instant if input matches `^0x[a-f0-9]{64}$`
 *
 * Debounced 200ms; both fetches share an `AbortController` so stale
 * responses can't race fresh ones (typing fast → out-of-order resolves).
 *
 * Mirrors the keyboard / aria pattern from `SendRecipientInput`:
 * `role="combobox"`, listbox dropdown, click-only selection (arrow-key
 * navigation deferred — same posture as the send modal autocomplete).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import {
  looksLikeSuiNs,
  resolveSuiNs,
  SuinsResolutionError,
} from '@/lib/suins-resolver';
import { isAudricHandle } from '@/lib/identity/audric-handle-helpers';

interface AudricUserHit {
  username: string;
  fullHandle: string;
  address: string;
  claimedAt: string;
}

interface SuinsHit {
  name: string;
  address: string;
  /** True when `name` ends in `.audric.sui` — caller can route to profile. */
  isAudric: boolean;
}

const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;
const DEBOUNCE_MS = 200;

interface GlobalUsernameSearchProps {
  /**
   * Fired when the user picks a non-Audric resolution (generic SuiNS or
   * 0x address). The parent should switch to the chat panel and dispatch
   * a balance-check prompt — see `dashboard-content.tsx` integration
   * point. Passed the canonical 0x address (preferred for the agent),
   * a human-friendly label (suins name OR truncated 0x), and a `kind`
   * tag so the dispatched prompt can disambiguate (an explicit "this
   * is NOT an Audric handle" clause is what stops the agent from
   * silently expanding `funkii.sui` into `funkii.audric.sui` — the two
   * are different on-chain entities).
   */
  onCheckBalance?: (
    address: string,
    label: string,
    kind: 'suins' | 'address',
  ) => void;
  /**
   * [S.84 polish v5] Imperative focus signal. The expanded sidebar
   * mounts this component on render; when the user clicks the
   * collapsed sidebar's Search icon, the parent expands the sidebar
   * AND bumps this counter. The change-effect inside this component
   * focuses the input on the next render, so the user lands directly
   * in the search field instead of having to click again. Number (not
   * boolean) so successive clicks re-focus even if the user moved
   * focus away between clicks.
   */
  autoFocusTrigger?: number;
}

export function GlobalUsernameSearch({
  onCheckBalance,
  autoFocusTrigger,
}: GlobalUsernameSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [audricHits, setAudricHits] = useState<AudricUserHit[]>([]);
  const [suinsHit, setSuinsHit] = useState<SuinsHit | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // [S.84 polish v5] Focus on every trigger bump. The microtask delay
  // matches `<UsernameChangeModal>`'s focus-after-mount pattern — the
  // sidebar may still be transitioning from collapsed→expanded width
  // when the trigger fires, and synchronous focus loses to React's
  // own mount-time focus reset.
  useEffect(() => {
    if (!autoFocusTrigger) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [autoFocusTrigger]);

  const trimmed = value.trim();
  const isBareAddress = SUI_ADDRESS_REGEX.test(trimmed);
  // Normalise input to a bare label for the Audric directory prefix match:
  //   • `@alice`            → `alice`  (legacy leading-@ shortcut)
  //   • `alice@audric`      → `alice`  (S.118 SuiNS V2 short-form alias)
  //   • `alice.audric.sui`  → `alice`  (legacy on-chain full handle)
  //   • `alice`             → `alice`
  // [S.118 follow-up 2026-05-08] Without the `@audric` strip, a user pasting
  // `funkii@audric` from a share card got 0 directory hits even though the
  // profile exists — the directory keys on bare labels.
  const queryForDirectory = (() => {
    let q = trimmed.toLowerCase();
    if (q.startsWith('@')) q = q.slice(1);
    if (q.endsWith('@audric')) q = q.slice(0, -'@audric'.length);
    else if (q.endsWith('.audric.sui')) q = q.slice(0, -'.audric.sui'.length);
    return q;
  })();
  // SuiNS forward lookup needs the full on-chain form. Both `<label>@audric`
  // (V2 short-form) and `<label>.audric.sui` resolve via SuiNS RPC, but the
  // resolver's allow-list (`looksLikeSuiNs`) checks for `.sui` suffix, so
  // we canonicalise the @ form to `.audric.sui` before forwarding.
  const queryForSuins = trimmed.toLowerCase().endsWith('@audric')
    ? `${trimmed.toLowerCase().slice(0, -'@audric'.length)}.audric.sui`
    : trimmed.toLowerCase();

  useEffect(() => {
    abortRef.current?.abort();
    if (!trimmed) {
      setAudricHits([]);
      setSuinsHit(null);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);

    const t = setTimeout(async () => {
      try {
        const tasks: Array<Promise<unknown>> = [];

        // Audric directory — only fires for non-address inputs (the
        // directory keys on usernames; an address would always miss).
        if (!isBareAddress && queryForDirectory.length > 0) {
          tasks.push(
            (async () => {
              try {
                const res = await fetch(
                  `/api/identity/search?q=${encodeURIComponent(queryForDirectory)}&limit=5`,
                  { signal: ctrl.signal },
                );
                if (!res.ok) return;
                const body = (await res.json()) as { results?: AudricUserHit[] };
                if (ctrl.signal.aborted) return;
                setAudricHits(body.results ?? []);
              } catch {
                // network / abort → silent; user can still pick another row
              }
            })(),
          );
        } else {
          setAudricHits([]);
        }

        // SuiNS forward — only fires for `*.sui` inputs.
        if (looksLikeSuiNs(queryForSuins)) {
          tasks.push(
            (async () => {
              try {
                const addr = await resolveSuiNs(queryForSuins);
                if (ctrl.signal.aborted) return;
                setSuinsHit({
                  name: queryForSuins,
                  address: addr,
                  isAudric: isAudricHandle(queryForSuins),
                });
              } catch (err) {
                if (ctrl.signal.aborted) return;
                if (err instanceof SuinsResolutionError) {
                  setSuinsHit(null); // invalid / not registered → omit row
                }
              }
            })(),
          );
        } else {
          setSuinsHit(null);
        }

        await Promise.allSettled(tasks);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed, isBareAddress, queryForDirectory, queryForSuins]);

  const handleProfile = useCallback(
    (username: string) => {
      setValue('');
      setOpen(false);
      router.push(`/${username}`);
    },
    [router],
  );

  const handleBalance = useCallback(
    (address: string, label: string, kind: 'suins' | 'address') => {
      setValue('');
      setOpen(false);
      onCheckBalance?.(address, label, kind);
    },
    [onCheckBalance],
  );

  // Ranked dropdown rows — Audric users first, then SuiNS / 0x inferences.
  const showAddressRow = isBareAddress;
  const showAnyRow =
    audricHits.length > 0 || suinsHit !== null || showAddressRow;
  const showEmptyState =
    open && trimmed.length > 0 && !searching && !showAnyRow;
  const showDropdown = open && trimmed.length > 0;

  // Stable id for aria-controls.
  const listboxId = useMemo(() => 'global-username-search-listbox', []);

  return (
    <div
      className="relative"
      onBlur={(e) => {
        // Close the dropdown only when focus leaves the entire search
        // container (not when moving between input and a row).
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <div className="relative">
        <Icon
          name="search"
          size={12}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setValue('');
              setOpen(false);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          placeholder="Find a user, .sui, or 0x..."
          aria-label="Search Audric users, SuiNS names, or addresses"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          className="w-full pl-7 pr-2 py-2 rounded-sm border border-border-subtle bg-surface-nav text-[12px] text-fg-primary placeholder:text-fg-muted outline-none focus:border-border-strong transition-colors"
        />
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 z-20 rounded-md border border-border-subtle bg-surface-card shadow-[var(--shadow-flat)] overflow-hidden max-h-[60vh] overflow-y-auto"
        >
          {searching && !showAnyRow && (
            <div className="flex items-center gap-2 px-3 py-2 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
              <Icon name="spinner" size={10} aria-hidden className="animate-spin opacity-70" />
              Searching{'\u2026'}
            </div>
          )}

          {audricHits.map((r) => (
            <button
              key={`audric-${r.address}`}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => handleProfile(r.username)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:bg-surface-sunken"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span aria-hidden="true">🪪</span>
                <span className="font-mono text-[12px] text-fg-primary truncate">
                  {r.fullHandle}
                </span>
              </span>
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted shrink-0">
                Profile
              </span>
            </button>
          ))}

          {suinsHit && !suinsHit.isAudric && (
            <button
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => handleBalance(suinsHit.address, suinsHit.name, 'suins')}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left border-t border-border-subtle transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:bg-surface-sunken"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <Icon name="search" size={11} className="text-fg-muted" />
                <span className="font-mono text-[12px] text-fg-primary truncate">
                  {suinsHit.name}
                </span>
              </span>
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted shrink-0">
                Balance
              </span>
            </button>
          )}

          {showAddressRow && (
            <button
              type="button"
              role="option"
              aria-selected="false"
              onClick={() =>
                handleBalance(
                  trimmed,
                  `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`,
                  'address',
                )
              }
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left border-t border-border-subtle transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:bg-surface-sunken"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <Icon name="search" size={11} className="text-fg-muted" />
                <span className="font-mono text-[12px] text-fg-primary truncate">
                  {`${trimmed.slice(0, 10)}…${trimmed.slice(-6)}`}
                </span>
              </span>
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted shrink-0">
                Balance
              </span>
            </button>
          )}

          {showEmptyState && (
            <div className="px-3 py-2.5 text-[12px] leading-[1.5] text-fg-muted">
              No Audric user, SuiNS name, or address matches{' '}
              <span className="font-mono text-fg-secondary">{trimmed}</span>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
