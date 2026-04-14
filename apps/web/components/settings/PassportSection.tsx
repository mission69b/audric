'use client';

import { useState } from 'react';
import { truncateAddress } from '@/lib/format';

interface PassportSectionProps {
  address: string | null;
  network: string;
  expiresAt: number | null;
  expiringSoon: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}

export function PassportSection({ address, network, expiresAt, expiringSoon, onRefresh, onLogout }: PassportSectionProps) {
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
    <section className="space-y-5">
      <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
        Passport
      </h2>

      <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[9px] tracking-wider text-success uppercase bg-success/10 px-1.5 py-0.5 rounded">zkLogin</span>
          <span className="text-xs text-dim">No seed phrase, ever</span>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Your wallet is controlled by your Google login via Sui zkLogin. There is no seed phrase to lose.
          Sign out and sign back in any time — your wallet and funds remain.
        </p>
      </div>

      <Row label="Wallet address">
        <span className="font-mono text-xs text-foreground">{address ? truncateAddress(address) : '\u2014'}</span>
        <button onClick={handleCopy} className="ml-2 font-mono text-[10px] tracking-wider text-muted uppercase hover:text-foreground transition">
          {copied ? '\u2713 Copied' : 'Copy'}
        </button>
      </Row>

      <Row label="Network">
        <span className="text-sm text-foreground capitalize">{network}</span>
      </Row>

      <Row label="Sign-in session">
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm text-foreground">
            {expiryDate ? `Expires ${expiryDate.toLocaleDateString()} (${daysLeft}d)` : '\u2014'}
          </span>
          {expiringSoon && (
            <span className="text-xs text-warning flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Expiring soon
            </span>
          )}
        </div>
      </Row>

      {address && (
        <Row label="Public report">
          <a
            href={`/report/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-wider text-muted uppercase hover:text-foreground transition"
          >
            View report &rarr;
          </a>
        </Row>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onRefresh} className="rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition">
          Refresh Session
        </button>
        <button onClick={onLogout} className="rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition">
          Sign Out
        </button>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
