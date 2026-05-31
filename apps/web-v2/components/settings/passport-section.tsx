"use client";

/**
 * Passport settings — identity + account.
 *
 * Ported from `apps/web/components/settings/PassportSection.tsx`.
 *
 * Diffs from legacy:
 *   - Username modals come from sibling files in the same folder.
 *   - `next/link` instead of any custom Link wrapper.
 *   - [2026-05-31] Appearance/theme card dropped — the theme toggle now
 *     lives in the account dropdown (single source), so a duplicate picker
 *     here was redundant.
 *   - [2026-05-31] Refresh-session + Sign-out buttons dropped — Sign out
 *     lives in the account dropdown (single source) and "Refresh session"
 *     was just logout+login (re-auth), reachable by signing out then back
 *     in. This is an identity/info surface, not an action surface.
 *   - [2026-05-31] Sign-in session expiry now reflects the JWT `exp` (the
 *     ~1h Google-OIDC token the server re-verifies on every API call),
 *     not the ~7d Sui-epoch ephemeral-key window. The old display claimed
 *     "7 days" while the user was actually bounced within the hour.
 *
 * Layout (matches legacy D10 design):
 *   1. zkLogin intro card (sunken)
 *   2. IDENTITY card — handle + COPY + CHANGE + VIEW PROFILE
 *      (or empty-state with CLAIM HANDLE button when unclaimed)
 *   3. ACCOUNT card — wallet address / network / sign-in email /
 *      sign-in session expiry
 */

import Link from "next/link";
import { useState } from "react";
import { Tag } from "@/components/ui/tag";
import { truncateAddress } from "@/lib/format";
import { decodeJwtClaim, decodeJwtExp } from "@/lib/jwt-client";
import { UsernameChangeModal } from "./username-change-modal";
import { UsernameClaimModal } from "./username-claim-modal";

interface PassportSectionProps {
  address: string | null;
  expiresAt: number | null;
  expiringSoon: boolean;
  googleName?: string | null;
  jwt: string | null;
  network: string;
  onUsernameChanged?: () => void;
  username: string | null;
}

/** Terse, adaptive "expires in …" label — minutes < 1h, hours < 1d, else days. */
function formatExpiresIn(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) {
    return "Expired";
  }
  const mins = Math.round(diff / 60_000);
  if (mins < 60) {
    return `Expires in ${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem > 0 ? `Expires in ${hours}h ${rem}m` : `Expires in ${hours}h`;
  }
  return `Expires in ${Math.round(hours / 24)}d`;
}

export function PassportSection({
  address,
  network,
  expiresAt,
  expiringSoon,
  username,
  jwt,
  onUsernameChanged,
  googleName,
}: PassportSectionProps) {
  const [copied, setCopied] = useState(false);
  const [handleCopied, setHandleCopied] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);

  // The real sign-in expiry is the SOONER of the Sui-epoch session (~7d,
  // drives `expiresAt`) and the Google OIDC JWT `exp` (~1h) — the server
  // re-verifies the raw JWT on every request, so the JWT is the binding
  // constraint and the user is bounced when it lapses.
  const jwtExpSec = decodeJwtExp(jwt);
  const jwtExpMs = jwtExpSec == null ? null : jwtExpSec * 1000;
  const effectiveExpiry =
    expiresAt != null && jwtExpMs != null
      ? Math.min(expiresAt, jwtExpMs)
      : (jwtExpMs ?? expiresAt);

  const fullHandle = username ? `${username}@audric` : null;
  const signInEmail = decodeJwtClaim(jwt, "email");

  const handleCopy = () => {
    if (!address) {
      return;
    }
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHandleCopy = () => {
    if (!fullHandle) {
      return;
    }
    navigator.clipboard.writeText(fullHandle);
    setHandleCopied(true);
    setTimeout(() => setHandleCopied(false), 2000);
  };

  return (
    <div className="flex flex-col">
      <div className="mb-5 rounded-md border border-border bg-muted p-4">
        <div className="mb-2 flex items-center gap-2.5">
          <Tag tone="green">zkLogin</Tag>
          <span className="text-[13px] text-foreground">
            No seed phrase, ever
          </span>
        </div>
        <p className="text-[12px] leading-[1.55] text-muted-foreground">
          Your wallet is controlled by your Google login via Sui zkLogin. There
          is no seed phrase to lose. Sign out and sign back in any time &mdash;
          your wallet and funds remain.
        </p>
      </div>

      <div
        className="mb-5 rounded-md border border-border bg-muted p-4"
        data-testid="passport-handle-card"
      >
        {fullHandle ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">🪪</span>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  IDENTITY
                </p>
              </div>
              <p
                className="mt-2 break-all font-mono text-[18px] leading-[1.2] text-foreground"
                data-testid="passport-handle-value"
              >
                {fullHandle}
              </p>
              <p className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">
                Your handle on the Sui network.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
              <Link
                className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition hover:text-foreground focus-visible:underline focus-visible:outline-none"
                href={`/${username}`}
              >
                VIEW PROFILE →
              </Link>
              <button
                aria-label="Copy Audric handle"
                className="rounded-xs border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
                onClick={handleHandleCopy}
                type="button"
              >
                {handleCopied ? "\u2713 COPIED" : "COPY"}
              </button>
              <button
                className="rounded-xs border border-foreground bg-foreground px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-background transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="passport-handle-change"
                disabled={!jwt || !address}
                onClick={() => setChangeOpen(true)}
                type="button"
              >
                CHANGE
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">🪪</span>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  IDENTITY
                </p>
              </div>
              <p className="mt-2 text-[12px] leading-[1.55] text-muted-foreground">
                You haven&rsquo;t claimed your Audric handle yet &mdash; friends
                send you USDC by typing{" "}
                <span className="font-mono text-foreground">@yourhandle</span>.
              </p>
            </div>
            <button
              className="shrink-0 rounded-sm border border-foreground bg-foreground px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-background transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="passport-handle-claim"
              disabled={!jwt || !address}
              onClick={() => setClaimOpen(true)}
              type="button"
            >
              CLAIM HANDLE
            </button>
          </div>
        )}
      </div>

      <div className="mb-5 rounded-md border border-border bg-muted p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Account
        </p>
        <PassportRow label="Wallet address">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-foreground">
              {address ? truncateAddress(address) : "\u2014"}
            </span>
            <button
              aria-label="Copy wallet address"
              className="rounded-xs border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!address}
              onClick={handleCopy}
              type="button"
            >
              {copied ? "\u2713 Copied" : "Copy"}
            </button>
          </div>
        </PassportRow>

        <PassportRow label="Network">
          <span className="text-[13px] capitalize text-foreground">
            {network}
          </span>
        </PassportRow>

        <PassportRow label="Sign-in email">
          <span className="max-w-[280px] truncate text-[13px] text-foreground">
            {signInEmail ?? "\u2014"}
          </span>
        </PassportRow>

        <PassportRow label="Sign-in session" last>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[13px] text-foreground">
              {effectiveExpiry == null
                ? "\u2014"
                : formatExpiresIn(effectiveExpiry)}
            </span>
            {expiringSoon && (
              <span className="flex items-center gap-1 text-[11px] text-warning">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-warning"
                />
                Expiring soon
              </span>
            )}
          </div>
        </PassportRow>
      </div>

      {username && jwt && address && (
        <UsernameChangeModal
          address={address}
          currentLabel={username}
          jwt={jwt}
          onChanged={() => onUsernameChanged?.()}
          onClose={() => setChangeOpen(false)}
          open={changeOpen}
        />
      )}

      {!username && jwt && address && (
        <UsernameClaimModal
          address={address}
          googleEmail={signInEmail}
          googleName={googleName}
          jwt={jwt}
          onClaimed={() => {
            setClaimOpen(false);
            onUsernameChanged?.();
          }}
          onClose={() => setClaimOpen(false)}
          open={claimOpen}
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
        "flex items-center justify-between py-4",
        last ? "" : "border-b border-border",
      ].join(" ")}
    >
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
