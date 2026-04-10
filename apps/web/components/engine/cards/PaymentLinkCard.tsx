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
    active: { label: 'Active', cls: 'bg-green-500/15 text-green-400' },
    paid: { label: 'Paid', cls: 'bg-blue-500/15 text-blue-400' },
    expired: { label: 'Expired', cls: 'bg-zinc-500/15 text-zinc-400' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-500/15 text-red-400' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-zinc-500/15 text-zinc-400' };
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${s.cls}`}>
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
          ? 'text-emerald-400 border-emerald-400/40'
          : 'text-zinc-400 hover:text-white border-zinc-700 hover:border-zinc-500'
      }`}
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}

export function PaymentLinkCard({ data }: { data: unknown }) {
  const d = data as PaymentLink | PaymentLinkList;

  // List view
  if ('links' in d) {
    if (!d.links.length) {
      return (
        <CardShell title="Payment Links">
          <p className="text-sm text-zinc-500">No payment links yet.</p>
        </CardShell>
      );
    }
    return (
      <CardShell title="Payment Links">
        <div className="space-y-2">
          {d.links.map((l) => (
            <div key={l.slug} className="py-2 border-b border-zinc-800 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{l.label ?? `Link ${l.slug.slice(0, 6)}`}</p>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {l.amount != null ? fmtUsd(l.amount) : 'Open amount'} · {new Date(l.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill status={l.status} />
                  {l.status === 'active' && <CopyButton text={l.url} />}
                </div>
              </div>
              <span className="font-mono text-[10px] text-zinc-600 mt-0.5 block">{l.slug}</span>
            </div>
          ))}
        </div>
      </CardShell>
    );
  }

  // Single created link view
  const link = d as PaymentLink;
  const amountStr = link.amount != null ? fmtUsd(link.amount) : 'Open amount';

  return (
    <CardShell title="Payment Link Created">
      <div className="space-y-3">
        {link.label && (
          <p className="text-sm text-white">{link.label}</p>
        )}
        <div className="flex items-center justify-between">
          <MonoLabel className="text-zinc-400">Amount</MonoLabel>
          <span className="text-sm font-semibold text-white">{amountStr} {link.currency}</span>
        </div>
        {link.memo && (
          <div className="flex items-center justify-between">
            <MonoLabel className="text-zinc-400">Memo</MonoLabel>
            <span className="text-sm text-zinc-300">{link.memo}</span>
          </div>
        )}
        {link.expiresAt && (
          <div className="flex items-center justify-between">
            <MonoLabel className="text-zinc-400">Expires</MonoLabel>
            <span className="text-sm text-zinc-300">{new Date(link.expiresAt).toLocaleDateString()}</span>
          </div>
        )}
        <div className="pt-1 space-y-2">
          <div className="bg-zinc-900 rounded-lg px-3 py-2 font-mono text-xs text-zinc-300 break-all">
            {link.url}
          </div>
          <CopyButton text={link.url} />
        </div>
      </div>
    </CardShell>
  );
}
