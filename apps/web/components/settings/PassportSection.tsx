'use client';

// [PHASE 10] Passport sub-section — re-skinned to match
// `design_handoff_audric/.../settings.jsx` Passport block.
//
// Layout:
//   • Intro card (sunken bg) with ZKLOGIN tag + headline + paragraph
//   • [S.84] HANDLE card — Audric handle (full `username.audric.sui`) +
//     COPY + CHANGE buttons + "View profile →" link. Empty-state pill
//     when the user hasn't claimed yet (rare in production — the signup
//     gate handles first-time claim — but defensive for users who
//     skipped the gate via the "Skip for now" affordance).
//   • Detail rows (label left / value right, hairline divider between)
//     - Wallet address  (mono + COPY chip)
//     - Network         (capitalised)
//     - Sign-in session (Expires <date> (Nd)  + optional warning sub-line)
//   • APPEARANCE card (sunken, segmented LIGHT/DARK/SYSTEM control) — added
//     in dark-mode Phase 4. Visual treatment mirrors SafetySection's
//     permission-preset radio group exactly.
//   • Two square-corner outlined buttons: REFRESH SESSION / SIGN OUT
//
// Behavior preserved:
//   • address / network / expiresAt / expiringSoon / onRefresh / onLogout
//     props identical
//   • Copy uses navigator.clipboard.writeText with 2s "Copied" feedback
//   • All wired actions still call back to useZkLogin from the parent

import { useState } from 'react';
import Link from 'next/link';
import { Tag } from '@/components/ui/Tag';
import { truncateAddress } from '@/lib/format';
import { useTheme, type Theme } from '@/components/providers/ThemeProvider';
import { UsernameChangeModal } from '@/components/identity/UsernameChangeModal';
import { decodeJwtClaim } from '@/lib/jwt-client';

interface PassportSectionProps {
  address: string | null;
  network: string;
  expiresAt: number | null;
  expiringSoon: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  /**
   * [S.84] Bare Audric handle (e.g. `'alice'`), or `null` when the user
   * hasn't claimed yet. When `null`, the handle card renders an
   * empty-state instead of the change-handle controls. Sourced from
   * `useUserStatus` in the parent settings page.
   */
  username: string | null;
  /**
   * [S.84] zkLogin JWT — passed to the change modal as the
   * `x-zklogin-jwt` header for `/api/identity/change`.
   */
  jwt: string | null;
  /**
   * [S.84] Called after a successful handle change. Parent should
   * refetch userStatus so the Sidebar/Greeting/PassportSection all
   * pick up the new handle on next render.
   */
  onUsernameChanged?: () => void;
}

const THEME_ORDER: Theme[] = ['light', 'dark', 'system'];

export function PassportSection({
  address,
  network,
  expiresAt,
  expiringSoon,
  onRefresh,
  onLogout,
  username,
  jwt,
  onUsernameChanged,
}: PassportSectionProps) {
  const [copied, setCopied] = useState(false);
  const [handleCopied, setHandleCopied] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  const fullHandle = username ? `${username}.audric.sui` : null;
  // [S.84 polish v2] zkLogin email — closes the "which Google am I
  // signed in with?" gap. Settings → Passport is the canonical home
  // for the email; the sidebar footer references it as the muted
  // secondary line under the handle.
  const signInEmail = decodeJwtClaim(jwt, 'email');

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHandleCopy = () => {
    if (!fullHandle) return;
    navigator.clipboard.writeText(fullHandle);
    setHandleCopied(true);
    setTimeout(() => setHandleCopied(false), 2000);
  };

  return (
    <div className="flex flex-col">
      <div className="rounded-md border border-border-subtle bg-surface-sunken p-4 mb-5">
        <div className="flex items-center gap-2.5 mb-2">
          <Tag tone="green">zkLogin</Tag>
          <span className="text-[13px] text-fg-primary">No seed phrase, ever</span>
        </div>
        <p className="text-[12px] text-fg-secondary leading-[1.55]">
          Your wallet is controlled by your Google login via Sui zkLogin. There is no seed phrase
          to lose. Sign out and sign back in any time &mdash; your wallet and funds remain.
        </p>
      </div>

      {/* [S.84] IDENTITY card — your Audric identity. Full `<label>.audric.sui`
          form per D10 (never the bare label, never just `@label`). When
          `username` is null the card collapses to an empty state pointing
          back to the dashboard's claim gate.

          Eyebrow label is "Identity" (not "Audric handle"): we're already
          inside the Passport section, so prefixing with "Audric" reads as
          duplication, and "handle" was too literal — sounded like a
          username when the framing is "this is your identity." Functional
          row-label form matches its neighbours (Wallet address, Network,
          Sign-in session). */}
      <div
        data-testid="passport-handle-card"
        className="rounded-md border border-border-subtle bg-surface-sunken p-4 mb-5"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span aria-hidden="true">🪪</span>
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted">
              Identity
            </p>
          </div>
          {fullHandle && (
            <Link
              href={`/${username}`}
              className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted hover:text-fg-primary transition focus-visible:outline-none focus-visible:underline"
            >
              View profile →
            </Link>
          )}
        </div>
        {fullHandle ? (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
            <p
              data-testid="passport-handle-value"
              className="break-all font-mono text-[14px] text-fg-primary"
            >
              {fullHandle}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleHandleCopy}
                className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted px-1.5 py-0.5 border border-border-subtle rounded-xs hover:text-fg-primary hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                aria-label="Copy Audric handle"
              >
                {handleCopied ? '\u2713 Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => setChangeOpen(true)}
                disabled={!jwt || !address}
                data-testid="passport-handle-change"
                className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted px-1.5 py-0.5 border border-border-subtle rounded-xs hover:text-fg-primary hover:border-border-strong transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                Change
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1">
            <p className="text-[12px] text-fg-secondary leading-[1.55]">
              You haven&rsquo;t claimed your Audric handle yet. Head back to the dashboard to pick
              one &mdash; this is your identity layer.
            </p>
          </div>
        )}
      </div>

      <PassportRow label="Wallet address">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-fg-primary">
            {address ? truncateAddress(address) : '\u2014'}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!address}
            className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted px-1.5 py-0.5 border border-border-subtle rounded-xs hover:text-fg-primary hover:border-border-strong transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            aria-label="Copy wallet address"
          >
            {copied ? '\u2713 Copied' : 'Copy'}
          </button>
        </div>
      </PassportRow>

      <PassportRow label="Network">
        <span className="text-[13px] text-fg-primary capitalize">{network}</span>
      </PassportRow>

      {/* [S.84 polish v2] Sign-in email row — paired with the session
          expiry row directly below it (auth identity + auth lifetime
          read as a single unit). The intro card mentions Google login
          but never says WHICH Google account; this row closes that
          gap. Source = `decodeJwtClaim(jwt, 'email')` — the same
          claim path the sidebar uses, so the value matches across
          surfaces. Falls back to em-dash when JWT is unavailable
          (e.g. transient session-load state). */}
      <PassportRow label="Sign-in email">
        <span className="text-[13px] text-fg-primary truncate max-w-[280px]">
          {signInEmail ?? '\u2014'}
        </span>
      </PassportRow>

      <PassportRow label="Sign-in session" last>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[13px] text-fg-primary">
            {expiryDate ? `Expires ${expiryDate.toLocaleDateString()} (${daysLeft}d)` : '\u2014'}
          </span>
          {expiringSoon && (
            <span className="text-[11px] text-warning-fg flex items-center gap-1">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning-solid" />
              Expiring soon
            </span>
          )}
        </div>
      </PassportRow>

      <div className="rounded-md border border-border-subtle bg-surface-sunken p-4 mt-5">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          Appearance
        </p>
        <p className="text-[12px] text-fg-secondary mt-1 mb-3.5">
          Choose how Audric looks. <span className="font-mono text-fg-primary">System</span> follows
          your operating system.
        </p>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
          {THEME_ORDER.map((t) => {
            const active = t === theme;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(t)}
                className={[
                  'px-3 py-2 rounded-sm font-mono text-[10px] tracking-[0.12em] uppercase transition border',
                  'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
                  active
                    ? 'bg-fg-primary text-fg-inverse border-fg-primary'
                    : 'bg-surface-card text-fg-secondary border-border-strong hover:text-fg-primary hover:border-fg-primary',
                ].join(' ')}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mt-6">
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-2.5 rounded-sm border border-border-strong font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary hover:bg-surface-sunken transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          Refresh session
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="px-4 py-2.5 rounded-sm border border-border-strong font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary hover:bg-surface-sunken transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          Sign out
        </button>
      </div>

      {username && jwt && address && (
        <UsernameChangeModal
          open={changeOpen}
          address={address}
          jwt={jwt}
          currentLabel={username}
          onClose={() => setChangeOpen(false)}
          onChanged={() => {
            onUsernameChanged?.();
          }}
        />
      )}
    </div>
  );
}

function PassportRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={[
        'flex items-center justify-between py-4',
        last ? '' : 'border-b border-border-subtle',
      ].join(' ')}
    >
      <span className="text-[13px] text-fg-secondary">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
