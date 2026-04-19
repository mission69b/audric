'use client';

// [PHASE 10] Passport sub-section — re-skinned to match
// `design_handoff_audric/.../settings.jsx` Passport block.
//
// Layout:
//   • Intro card (sunken bg) with ZKLOGIN tag + headline + paragraph
//   • Detail rows (label left / value right, hairline divider between)
//     - Wallet address  (mono + COPY chip)
//     - Network         (capitalised)
//     - Sign-in session (Expires <date> (Nd)  + optional warning sub-line)
//     - Public report   (mono "VIEW REPORT →" link)
//   • Two square-corner outlined buttons: REFRESH SESSION / SIGN OUT
//
// Behavior preserved:
//   • address / network / expiresAt / expiringSoon / onRefresh / onLogout
//     props identical
//   • Copy uses navigator.clipboard.writeText with 2s "Copied" feedback
//   • All wired actions still call back to useZkLogin from the parent

import { useState } from 'react';
import { Tag } from '@/components/ui/Tag';
import { truncateAddress } from '@/lib/format';

interface PassportSectionProps {
  address: string | null;
  network: string;
  expiresAt: number | null;
  expiringSoon: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

export function PassportSection({
  address,
  network,
  expiresAt,
  expiringSoon,
  onRefresh,
  onLogout,
}: PassportSectionProps) {
  const [copied, setCopied] = useState(false);

  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
