'use client';

import { useState } from 'react';
import { CardShell, MonoLabel, fmtUsd } from './primitives';

interface PaymentLink {
  slug: string;
  url: string;
  amount: number | null;
  currency: string;
  label: string | null;
  memo: string | null;
  expiresAt: string | null;
}

interface PaymentLinkList {
  links: Array<{
    slug: string;
    url: string;
    amount: number | null;
    currency: string;
    label: string | null;
    status: string;
    paidAt: string | null;
    createdAt: string;
  }>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-success-bg text-success-fg border border-success-border' },
    paid: { label: 'Paid', cls: 'bg-info-bg text-info-fg border border-info-border' },
    expired: { label: 'Expired', cls: 'bg-surface-sunken text-fg-muted border border-border-subtle' },
    cancelled: { label: 'Cancelled', cls: 'bg-error-bg text-error-fg border border-error-border' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-surface-sunken text-fg-muted border border-border-subtle' };
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-xs ${s.cls}`}>
      {s.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`text-[11px] font-mono transition-colors border rounded px-2 py-0.5 ${
        copied
          ? 'text-success-solid border-success-border'
          : 'text-fg-secondary hover:text-fg-primary border-border-subtle hover:border-border-strong'
      }`}
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}

export function PaymentLinkCard({ data }: { data: unknown }) {
  const d = data as PaymentLink | PaymentLinkList;

  if ('links' in d) {
    if (!d.links.length) {
      return (
        <CardShell title="Payment Links">
          <p className="text-sm text-fg-muted">No payment links yet.</p>
        </CardShell>
      );
    }
    return (
      <CardShell title="Payment Links">
        <div className="space-y-2">
          {d.links.map((l) => (
            <div key={l.slug} className="py-2 border-b border-border-subtle last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-fg-primary truncate">{l.label ?? `Link ${l.slug.slice(0, 6)}`}</p>
                  <span className="font-mono text-[11px] text-fg-muted">
                    {l.amount != null ? fmtUsd(l.amount) : 'Open amount'} · {new Date(l.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill status={l.status} />
                  {l.status === 'active' && <CopyButton text={l.url} />}
                </div>
              </div>
              <span className="font-mono text-[10px] text-fg-muted mt-0.5 block">{l.slug}</span>
            </div>
          ))}
        </div>
      </CardShell>
    );
  }

  const link = d as PaymentLink;
  const amountStr = link.amount != null ? fmtUsd(link.amount) : 'Open amount';

  return (
    <CardShell title="Payment Link Created">
      <div className="space-y-3">
        {link.label && (
          <p className="text-sm text-fg-primary">{link.label}</p>
        )}
        <div className="flex items-center justify-between">
          <MonoLabel>Amount</MonoLabel>
          <span className="text-sm font-semibold text-fg-primary font-mono">{amountStr} {link.currency}</span>
        </div>
        {link.memo && (
          <div className="flex items-center justify-between">
            <MonoLabel>Memo</MonoLabel>
            <span className="text-sm text-fg-secondary">{link.memo}</span>
          </div>
        )}
        {link.expiresAt && (
          <div className="flex items-center justify-between">
            <MonoLabel>Expires</MonoLabel>
            <span className="text-sm text-fg-secondary">{new Date(link.expiresAt).toLocaleDateString()}</span>
          </div>
        )}
        <div className="pt-1 space-y-2">
          <div className="bg-surface-sunken border border-border-subtle rounded-md px-3 py-2 font-mono text-xs text-fg-secondary break-all">
            {link.url}
          </div>
          <CopyButton text={link.url} />
        </div>
      </div>
    </CardShell>
  );
}
