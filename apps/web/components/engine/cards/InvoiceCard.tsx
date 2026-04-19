'use client';

import { CardShell, MonoLabel, fmtUsd } from './primitives';

interface Invoice {
  slug: string;
  url: string;
  amount: number;
  currency: string;
  label: string;
  memo: string | null;
  dueDate: string | null;
}

interface InvoiceList {
  invoices: Array<{
    slug: string;
    url: string;
    amount: number;
    currency: string;
    label: string;
    status: string;
    dueDate: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-warning-bg text-warning-fg border border-warning-border' },
    overdue: { label: 'Overdue', cls: 'bg-error-bg text-error-fg border border-error-border' },
    paid: { label: 'Paid', cls: 'bg-success-bg text-success-fg border border-success-border' },
    cancelled: { label: 'Cancelled', cls: 'bg-surface-sunken text-fg-muted border border-border-subtle' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-surface-sunken text-fg-muted border border-border-subtle' };
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-xs ${s.cls}`}>
      {s.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text)}
      className="text-[11px] font-mono text-fg-secondary hover:text-fg-primary transition-colors border border-border-subtle hover:border-border-strong rounded px-2 py-0.5"
    >
      Copy link
    </button>
  );
}

export function InvoiceCard({ data }: { data: unknown }) {
  const d = data as Invoice | InvoiceList;

  if ('invoices' in d) {
    if (!d.invoices.length) {
      return (
        <CardShell title="Invoices">
          <p className="text-sm text-fg-muted">No invoices yet.</p>
        </CardShell>
      );
    }
    return (
      <CardShell title="Invoices">
        <div className="space-y-2">
          {d.invoices.map((inv) => (
            <div key={inv.slug} className="py-2 border-b border-border-subtle last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-fg-primary truncate">{inv.label}</p>
                  <span className="font-mono text-[11px] text-fg-muted">
                    {fmtUsd(inv.amount)} {inv.currency}
                    {inv.dueDate ? ` · Due ${new Date(inv.dueDate).toLocaleDateString()}` : ''}
                  </span>
                </div>
                <StatusPill status={inv.status} />
              </div>
              <span className="font-mono text-[10px] text-fg-muted mt-0.5 block">{inv.slug}</span>
            </div>
          ))}
        </div>
      </CardShell>
    );
  }

  const inv = d as Invoice;

  return (
    <CardShell title="Invoice Created">
      <div className="space-y-3">
        <p className="text-sm text-fg-primary">{inv.label}</p>
        <div className="flex items-center justify-between">
          <MonoLabel>Total</MonoLabel>
          <span className="text-sm font-semibold text-fg-primary font-mono">{fmtUsd(inv.amount)} {inv.currency}</span>
        </div>
        {inv.memo && (
          <div className="flex items-center justify-between">
            <MonoLabel>Memo</MonoLabel>
            <span className="text-sm text-fg-secondary">{inv.memo}</span>
          </div>
        )}
        {inv.dueDate && (
          <div className="flex items-center justify-between">
            <MonoLabel>Due date</MonoLabel>
            <span className="text-sm text-fg-secondary">{new Date(inv.dueDate).toLocaleDateString()}</span>
          </div>
        )}
        <div className="pt-1 space-y-2">
          <div className="bg-surface-sunken border border-border-subtle rounded-md px-3 py-2 font-mono text-xs text-fg-secondary break-all">
            {inv.url}
          </div>
          <CopyButton text={inv.url} />
        </div>
      </div>
    </CardShell>
  );
}
