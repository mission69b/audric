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
    pending: { label: 'Pending', cls: 'bg-amber-500/15 text-amber-400' },
    overdue: { label: 'Overdue', cls: 'bg-red-500/15 text-red-400' },
    paid: { label: 'Paid', cls: 'bg-green-500/15 text-green-400' },
    cancelled: { label: 'Cancelled', cls: 'bg-zinc-500/15 text-zinc-400' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-zinc-500/15 text-zinc-400' };
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${s.cls}`}>
      {s.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text)}
      className="text-[11px] font-mono text-zinc-400 hover:text-white transition-colors border border-zinc-700 hover:border-zinc-500 rounded px-2 py-0.5"
    >
      Copy link
    </button>
  );
}

export function InvoiceCard({ data }: { data: unknown }) {
  const d = data as Invoice | InvoiceList;

  // List view
  if ('invoices' in d) {
    if (!d.invoices.length) {
      return (
        <CardShell title="Invoices">
          <p className="text-sm text-zinc-500">No invoices yet.</p>
        </CardShell>
      );
    }
    return (
      <CardShell title="Invoices">
        <div className="space-y-2">
          {d.invoices.map((inv) => (
            <div key={inv.slug} className="py-2 border-b border-zinc-800 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{inv.label}</p>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {fmtUsd(inv.amount)} {inv.currency}
                    {inv.dueDate ? ` · Due ${new Date(inv.dueDate).toLocaleDateString()}` : ''}
                  </span>
                </div>
                <StatusPill status={inv.status} />
              </div>
              <span className="font-mono text-[10px] text-zinc-600 mt-0.5 block">{inv.slug}</span>
            </div>
          ))}
        </div>
      </CardShell>
    );
  }

  // Single created invoice view
  const inv = d as Invoice;

  return (
    <CardShell title="Invoice Created">
      <div className="space-y-3">
        <p className="text-sm text-white">{inv.label}</p>
        <div className="flex items-center justify-between">
          <MonoLabel className="text-zinc-400">Total</MonoLabel>
          <span className="text-sm font-semibold text-white">{fmtUsd(inv.amount)} {inv.currency}</span>
        </div>
        {inv.memo && (
          <div className="flex items-center justify-between">
            <MonoLabel className="text-zinc-400">Memo</MonoLabel>
            <span className="text-sm text-zinc-300">{inv.memo}</span>
          </div>
        )}
        {inv.dueDate && (
          <div className="flex items-center justify-between">
            <MonoLabel className="text-zinc-400">Due date</MonoLabel>
            <span className="text-sm text-zinc-300">{new Date(inv.dueDate).toLocaleDateString()}</span>
          </div>
        )}
        <div className="pt-1 space-y-2">
          <div className="bg-zinc-900 rounded-lg px-3 py-2 font-mono text-xs text-zinc-300 break-all">
            {inv.url}
          </div>
          <CopyButton text={inv.url} />
        </div>
      </div>
    </CardShell>
  );
}
