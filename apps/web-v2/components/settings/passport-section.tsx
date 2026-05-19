"use client";

/**
 * Passport settings — identity, account, appearance.
 *
 * Ported from `apps/web/components/settings/PassportSection.tsx`.
 *
 * Three diffs from legacy:
 *   - `useTheme` from `next-themes` (web-v2 native) instead of the
 *     apps/web custom `ThemeProvider`. Same API shape, no behavior diff.
 *   - Username modals come from sibling files in the same folder.
 *   - `next/link` instead of any custom Link wrapper.
 *
 * Layout (matches legacy D10 design):
 *   1. zkLogin intro card (sunken)
 *   2. IDENTITY card — handle + COPY + CHANGE + VIEW PROFILE
 *      (or empty-state with CLAIM HANDLE button when unclaimed)
 *   3. ACCOUNT card — wallet address / network / sign-in email /
 *      sign-in session expiry
 *   4. APPEARANCE card — light / dark / system theme picker
 *   5. Action buttons — Refresh session / Sign out
 */

import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Tag } from "@/components/ui/tag";
import { truncateAddress } from "@/lib/format";
import { decodeJwtClaim } from "@/lib/jwt-client";
import { UsernameChangeModal } from "./username-change-modal";
import { UsernameClaimModal } from "./username-claim-modal";

interface PassportSectionProps {
  address: string | null;
  expiresAt: number | null;
  expiringSoon: boolean;
  googleName?: string | null;
  jwt: string | null;
  network: string;
  onLogout: () => void;
  onRefresh: () => void;
  onUsernameChanged?: () => void;
  username: string | null;
}

const THEME_ORDER = ["light", "dark", "system"] as const;
type Theme = (typeof THEME_ORDER)[number];

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
      <div className="mb-5 rounded-md border border-border-subtle bg-surface-sunken p-4">
        <div className="mb-2 flex items-center gap-2.5">
          <Tag tone="green">zkLogin</Tag>
          <span className="text-[13px] text-fg-primary">
            No seed phrase, ever
          </span>
        </div>
        <p className="text-[12px] leading-[1.55] text-fg-secondary">
          Your wallet is controlled by your Google login via Sui zkLogin. There
          is no seed phrase to lose. Sign out and sign back in any time &mdash;
          your wallet and funds remain.
        </p>
      </div>

      <div
        className="mb-5 rounded-md border border-border-subtle bg-surface-sunken p-4"
        data-testid="passport-handle-card"
      >
        {fullHandle ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">🪪</span>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
                  IDENTITY
                </p>
              </div>
              <p
                className="mt-2 break-all font-mono text-[18px] leading-[1.2] text-fg-primary"
                data-testid="passport-handle-value"
              >
                {fullHandle}
              </p>
              <p className="mt-1 text-[12px] leading-[1.5] text-fg-secondary">
                Your handle on the Sui network.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
              <Link
                className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted transition hover:text-fg-primary focus-visible:underline focus-visible:outline-none"
                href={`/${username}`}
              >
                VIEW PROFILE →
              </Link>
              <button
                aria-label="Copy Audric handle"
                className="rounded-xs border border-border-subtle px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-secondary transition hover:border-border-strong hover:text-fg-primary focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
                onClick={handleHandleCopy}
                type="button"
              >
                {handleCopied ? "\u2713 COPIED" : "COPY"}
              </button>
              <button
                className="rounded-xs border border-fg-primary bg-fg-primary px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-inverse transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
                  IDENTITY
                </p>
              </div>
              <p className="mt-2 text-[12px] leading-[1.55] text-fg-secondary">
                You haven&rsquo;t claimed your Audric handle yet &mdash; friends
                send you USDC by typing{" "}
                <span className="font-mono text-fg-primary">@yourhandle</span>.
              </p>
            </div>
            <button
              className="shrink-0 rounded-sm border border-fg-primary bg-fg-primary px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-inverse transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="mb-5 rounded-md border border-border-subtle bg-surface-sunken p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">
          Account
        </p>
        <PassportRow label="Wallet address">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-fg-primary">
              {address ? truncateAddress(address) : "\u2014"}
            </span>
            <button
              aria-label="Copy wallet address"
              className="rounded-xs border border-border-subtle px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-fg-muted transition hover:border-border-strong hover:text-fg-primary focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!address}
              onClick={handleCopy}
              type="button"
            >
              {copied ? "\u2713 Copied" : "Copy"}
            </button>
          </div>
        </PassportRow>

        <PassportRow label="Network">
          <span className="text-[13px] capitalize text-fg-primary">
            {network}
          </span>
        </PassportRow>

        <PassportRow label="Sign-in email">
          <span className="max-w-[280px] truncate text-[13px] text-fg-primary">
            {signInEmail ?? "\u2014"}
          </span>
        </PassportRow>

        <PassportRow label="Sign-in session" last>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[13px] text-fg-primary">
              {expiryDate
                ? `Expires ${expiryDate.toLocaleDateString()} (${daysLeft}d)`
                : "\u2014"}
            </span>
            {expiringSoon && (
              <span className="flex items-center gap-1 text-[11px] text-warning-fg">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-warning-solid"
                />
                Expiring soon
              </span>
            )}
          </div>
        </PassportRow>
      </div>

      <div className="mt-5 rounded-md border border-border-subtle bg-surface-sunken p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">
          Appearance
        </p>
        <p className="mt-1 mb-3.5 text-[12px] text-fg-secondary">
          Choose how Audric looks.{" "}
          <span className="font-mono text-fg-primary">System</span> follows your
          operating system.
        </p>
        <fieldset
          aria-label="Theme"
          className="m-0 grid grid-cols-3 gap-2 border-0 p-0"
        >
          {THEME_ORDER.map((t) => {
            const active = t === theme;
            return (
              // biome-ignore lint/a11y/useSemanticElements: CSS-styled radio chip — native <input type="radio"> wouldn't support the mono uppercase chip styling
              <button
                aria-checked={active}
                className={[
                  "rounded-sm border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition",
                  "focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none",
                  active
                    ? "border-fg-primary bg-fg-primary text-fg-inverse"
                    : "border-border-strong bg-surface-card text-fg-secondary hover:border-fg-primary hover:text-fg-primary",
                ].join(" ")}
                key={t}
                onClick={() => setTheme(t as Theme)}
                role="radio"
                type="button"
              >
                {t}
              </button>
            );
          })}
        </fieldset>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          className="rounded-sm border border-border-strong px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-primary transition hover:bg-surface-sunken focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          onClick={onRefresh}
          type="button"
        >
          Refresh session
        </button>
        <button
          className="rounded-sm border border-border-strong px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-primary transition hover:bg-surface-sunken focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          onClick={onLogout}
          type="button"
        >
          Sign out
        </button>
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
        last ? "" : "border-b border-border-subtle",
      ].join(" ")}
    >
      <span className="text-[13px] text-fg-secondary">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
