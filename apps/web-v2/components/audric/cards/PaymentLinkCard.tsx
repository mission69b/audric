'use client';

import { useState } from 'react';
import { CardShell, MonoLabel, fmtUsd } from './primitives';
import { QrCode } from './shared/QrCode';

// PaymentLinkCard — `create_payment_link` + `list_payment_links` tool
// renderer. Ported from `apps/web/components/engine/cards/PaymentLinkCard.tsx`
// by Phase 5a.4 (renderer migration sweep, 2026-05-19). Verbatim except
// QrCode import path.

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
  links: {
    slug: string;
    url: string;
    amount: number | null;
    currency: string;
    label: string | null;
    status: string;
    paidAt: string | null;
    createdAt: string;
  }[];
}

function StatusPill({ status }: { status: string }) {
  // [R6.4 / A4] Outline badges per phase2-payment-link.html `.badge`.
  const map: Record<string, { label: string; cls: string }> = {
    active: {
      label: 'Active',
      cls: 'text-success border-success',
    },
    paid: {
      label: 'Paid',
      cls: 'text-info border-info',
    },
    expired: {
      label: 'Expired',
      cls: 'text-muted-foreground border-border',
    },
    cancelled: {
      label: 'Cancelled',
      cls: 'text-destructive border-destructive',
    },
  };
  const s = map[status] ?? {
    label: status,
    cls: 'text-muted-foreground border-border',
  };
  return (
    <span
      className={`rounded-[3px] border px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-[0.08em] ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // best-effort
      });
  };

  // [R6.6 / 6b] phase2-payment-link `.copy-btn` — mono outline pill.
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`rounded border px-2.5 py-1 font-mono text-[10.5px] tracking-[0.06em] transition-colors ${
        copied
          ? 'border-success/30 text-success'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
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
        <CardShell title="Payment links">
          <p className="text-[13px] text-muted-foreground">
            No payment links yet.
          </p>
        </CardShell>
      );
    }
    // [R6.6 / 6b] phase2-payment-link `.list-row` — 3-col grid
    // (name+meta / status badge / copy), hairline dividers, full-bleed rows.
    return (
      <CardShell noPadding title="Payment links">
        <div>
          {d.links.map((l) => (
            <div
              key={l.slug}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-border border-b px-[18px] py-[14px] last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium font-sans text-[14px] text-foreground tracking-[-0.011em]">
                  {l.label ?? 'Payment Link'}
                </p>
                <p className="mt-[3px] font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
                  {l.amount != null ? fmtUsd(l.amount) : 'Open amount'} ·{' '}
                  {new Date(l.createdAt).toLocaleDateString()}
                  <span className="mt-[1px] block">{l.slug}</span>
                </p>
              </div>
              <StatusPill status={l.status} />
              {l.status === 'active' ? <CopyButton text={l.url} /> : <span />}
            </div>
          ))}
        </div>
      </CardShell>
    );
  }

  const link = d as PaymentLink;
  const amountStr = link.amount != null ? fmtUsd(link.amount) : 'Open amount';
  const title =
    link.label ??
    (link.amount != null
      ? `Payment — $${amountStr} ${link.currency}`
      : 'Payment Link');

  // [R6.6 / 6b] phase2-payment-link `.created` — sans title, mono amount row,
  // url row, copy, and a divided QR block ("Scan to pay").
  return (
    <CardShell title="Payment link created">
      <div className="space-y-3.5">
        <h3 className="font-medium font-sans text-[17px] text-foreground tracking-[-0.014em]">
          {title}
        </h3>

        <div className="flex items-baseline justify-between py-1">
          <MonoLabel>Amount</MonoLabel>
          <span className="font-medium font-mono text-[20px] text-foreground tabular-nums tracking-[-0.018em]">
            {amountStr}
            {link.amount != null ? ` ${link.currency}` : ''}
          </span>
        </div>

        {link.memo && (
          <div className="flex items-baseline justify-between">
            <MonoLabel>Memo</MonoLabel>
            <span className="text-[13px] text-muted-foreground">{link.memo}</span>
          </div>
        )}
        {link.expiresAt && (
          <div className="flex items-baseline justify-between">
            <MonoLabel>Expires</MonoLabel>
            <span className="text-[13px] text-muted-foreground">
              {new Date(link.expiresAt).toLocaleDateString()}
            </span>
          </div>
        )}

        <div className="space-y-2">
          <div className="truncate rounded-md border border-border bg-muted px-3.5 py-2.5 font-mono text-[13px] text-foreground">
            {link.url}
          </div>
          <CopyButton text={link.url} />
        </div>

        <div className="flex flex-col items-center gap-2 border-border border-t pt-4">
          <div className="rounded-lg bg-white p-3">
            <QrCode size={144} value={link.url} />
          </div>
          <MonoLabel>Scan to pay</MonoLabel>
        </div>
      </div>
    </CardShell>
  );
}
