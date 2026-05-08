'use client';

// [PHASE 10] Passport sub-section — re-skinned to match
// `design_handoff_audric/.../settings.jsx` Passport block.
//
// Layout:
//   • Intro card (sunken bg) with ZKLOGIN tag + headline + paragraph
//   • [S.84 / S.118 follow-up] HANDLE card — Audric handle (display form
//     `username@audric`, the SuiNS V2 short-form alias) +
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
import { UsernameClaimModal } from '@/components/identity/UsernameClaimModal';
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
   * [S.84] Called after a successful handle change OR re-claim from
   * the safety-valve modal. Parent should refetch userStatus so the
   * Sidebar/Greeting/PassportSection all pick up the new handle on
   * next render.
   */
  onUsernameChanged?: () => void;
  /**
   * [S.84 polish v4] Google `name` claim — used for picker smart
   * pre-fill when the user opens the safety-valve claim modal.
   * Sourced from the same JWT decode the dashboard uses.
   */
  googleName?: string | null;
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
  googleName,
}: PassportSectionProps) {
  const [copied, setCopied] = useState(false);
  const [handleCopied, setHandleCopied] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  // [S.118 follow-up 2026-05-08] Display switched to the SuiNS V2 short-form
  // alias `<label>@audric` (was `<label>.audric.sui`). The COPY button now
  // writes the @ form to the clipboard — matches what users SEE on the card.
  // Both forms resolve to the same address via SuiNS RPC; the on-chain NFT
  // name is unchanged.
  const fullHandle = username ? `${username}@audric` : null;
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

      {/* [S.84 / B6 design pass / S.118 follow-up] IDENTITY card — your
          Audric identity. Display form is `<label>@audric` (S.118 reversed
          the original D10 universal-`.audric.sui` rule for user-facing UI;
          the on-chain NFT name remains `.audric.sui`). When `username` is
          null the card collapses
          to an empty state with a CLAIM HANDLE primary CTA on the right.
          Layout matches the username-flow handoff bundle's
          `settings-backdrop.jsx` IDENTITY block: left-side identity stack
          (label / handle / helper) and right-side action row (VIEW
          PROFILE / COPY / CHANGE).

          Eyebrow label is "IDENTITY" (not "Audric handle"): we're already
          inside the Passport section, so prefixing with "Audric" reads as
          duplication, and "handle" was too literal — sounded like a
          username when the framing is "this is your identity." Functional
          row-label form matches its neighbours (Wallet address, Network,
          Sign-in session). */}
      <div
        data-testid="passport-handle-card"
        className="rounded-md border border-border-subtle bg-surface-sunken p-4 mb-5"
      >
        {fullHandle ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* Identity stack — IDENTITY eyebrow / mono handle / helper */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">🪪</span>
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted">
                  IDENTITY
                </p>
              </div>
              <p
                data-testid="passport-handle-value"
                className="mt-2 break-all font-mono text-[18px] leading-[1.2] text-fg-primary"
              >
                {fullHandle}
              </p>
              <p className="mt-1 text-[12px] leading-[1.5] text-fg-secondary">
                Your handle on the Sui network.
              </p>
            </div>

            {/* Action row — VIEW PROFILE → (ghost) / COPY (outlined) / CHANGE (primary) */}
            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
              <Link
                href={`/${username}`}
                className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted px-2 py-1 hover:text-fg-primary transition focus-visible:outline-none focus-visible:underline"
              >
                VIEW PROFILE →
              </Link>
              <button
                type="button"
                onClick={handleHandleCopy}
                className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary px-2 py-1 border border-border-subtle rounded-xs hover:text-fg-primary hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                aria-label="Copy Audric handle"
              >
                {handleCopied ? '\u2713 COPIED' : 'COPY'}
              </button>
              <button
                type="button"
                onClick={() => setChangeOpen(true)}
                disabled={!jwt || !address}
                data-testid="passport-handle-change"
                className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-inverse bg-fg-primary px-2 py-1 border border-fg-primary rounded-xs hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                CHANGE
              </button>
            </div>
          </div>
        ) : (
          // [S.84 polish v4] Empty-state CTA — opens the safety-valve
          // claim modal in-place. Originally just a "head back to the
          // dashboard" instruction, which was a dead-end: clicking
          // "Skip for now" on the picker also persisted a localStorage
          // flag that hid the dashboard gate, so the user couldn't
          // re-trigger the picker from anywhere. The modal here mounts
          // the same `<UsernameClaimGate>` the dashboard uses, sans
          // Skip button, and clears the dormant skip flag on success.
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">🪪</span>
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted">
                  IDENTITY
                </p>
              </div>
              <p className="mt-2 text-[12px] text-fg-secondary leading-[1.55]">
                You haven&rsquo;t claimed your Audric handle yet &mdash; friends send you USDC by
                typing <span className="font-mono text-fg-primary">@yourhandle</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setClaimOpen(true)}
              disabled={!jwt || !address}
              data-testid="passport-handle-claim"
              className="shrink-0 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-inverse bg-fg-primary border border-fg-primary px-3 py-2 rounded-sm hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              CLAIM HANDLE
            </button>
          </div>
        )}
      </div>

      {/* [S.84 polish v3] ACCOUNT card — wraps the four detail rows
          (wallet address / network / sign-in email / sign-in session)
          in a sunken card with a mono eyebrow, matching the visual
          treatment of every other block in this section (intro card,
          identity card, appearance card) AND of every sibling section
          (Safety / Memory / Contacts all use sunken cards). Without
          the wrapper the rows were visually orphaned in the middle of
          the section — accidental drift from the original 3-zone
          layout (intro / rows / buttons) introduced when Identity
          (S.84) and Appearance (dark-mode Phase 4) cards were added
          above and below it. The rows themselves are unchanged; only
          the wrapper + eyebrow are new.

          Why "Account" (not "Details" or "Session"): "Details" is
          bland and makes no semantic claim; "Session" collides with
          the Sign-in session row label inside the card. "Account" is
          broad enough to cover all four (wallet = on-chain account,
          network = where it lives, email = auth account, session =
          this account's auth lifetime). */}
      <div className="rounded-md border border-border-subtle bg-surface-sunken p-4 mb-5">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          Account
        </p>
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
      </div>

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

      {/* [S.84 polish v4] Safety-valve claim modal — only mounted when
          the user has NO claimed handle yet AND we have the JWT/address
          to drive the gate. Mirrors UsernameChangeModal's mount-guard
          pattern; the boolean inversion is the key difference. */}
      {!username && jwt && address && (
        <UsernameClaimModal
          open={claimOpen}
          address={address}
          jwt={jwt}
          googleName={googleName}
          googleEmail={signInEmail}
          onClose={() => setClaimOpen(false)}
          onClaimed={() => {
            setClaimOpen(false);
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
