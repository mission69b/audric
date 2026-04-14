'use client';

import { useState, useEffect, useMemo } from 'react';

interface PayPanelProps {
  address: string;
  jwt: string;
  onSendMessage: (text: string) => void;
}

interface PaymentLink {
  id: string;
  slug: string;
  amount: number | null;
  label: string | null;
  status: string;
  createdAt: string;
}

interface Invoice {
  id: string;
  slug: string;
  amount: number | null;
  label: string | null;
  recipientName: string | null;
  status: string;
  createdAt: string;
}

function fmtAmount(amount: number | null): string {
  if (amount == null) return 'Variable';
  return `$${amount.toFixed(2)}`;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PayPanel({ address, jwt, onSendMessage }: PayPanelProps) {
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address || !jwt) { setLoading(false); return; }
    setLoading(true);
    const headers = { 'x-zklogin-jwt': jwt, 'x-sui-address': address };
    Promise.all([
      fetch('/api/payment-links', { headers }).then((r) => r.ok ? r.json() : []),
      fetch('/api/invoices', { headers }).then((r) => r.ok ? r.json() : []),
    ]).then(([linksData, invoicesData]) => {
      setPaymentLinks(Array.isArray(linksData) ? linksData : []);
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
    }).catch(() => {
      setPaymentLinks([]);
      setInvoices([]);
    }).finally(() => setLoading(false));
  }, [address, jwt]);

  const stats = useMemo(() => {
    const activeLinks = paymentLinks.filter((l) => l.status === 'active').length;
    const activeInvoices = invoices.filter((i) => i.status === 'active' || i.status === 'pending').length;
    const paidLinks = paymentLinks.filter((l) => l.status === 'paid');
    const paidInvoices = invoices.filter((i) => i.status === 'paid');
    const received = [...paidLinks, ...paidInvoices].reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
    return { activeLinks, activeInvoices, received, overdueCount };
  }, [paymentLinks, invoices]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-foreground">Pay</h2>
        <div className="flex gap-2">
          <button onClick={() => onSendMessage('Create a payment link for $10 USDC')} className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition">
            + Link
          </button>
          <button onClick={() => onSendMessage('Create an invoice for $50 USDC')} className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition">
            + Invoice
          </button>
        </div>
      </div>

      {/* 2x2 stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Payment Links" value={String(stats.activeLinks)} sub="active" prompt="Show all my payment links" onClick={() => onSendMessage('Show all my payment links')} />
        <StatCard label="Invoices" value={String(stats.activeInvoices)} sub={stats.overdueCount > 0 ? `${stats.overdueCount} overdue` : 'active'} warn={stats.overdueCount > 0} prompt="Show all my invoices" onClick={() => onSendMessage('Show all my invoices')} />
        <StatCard label="Received" value={fmtUsd(stats.received)} sub="total via links + invoices" accent={stats.received > 0} prompt="Show my payment received history" onClick={() => onSendMessage('Show my payment received history')} />
        <StatCard label="API Spend" value="--" sub="40+ services" prompt="Show my API spending breakdown" onClick={() => onSendMessage('Show my API spending breakdown')} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <Section title="Payment Links" count={paymentLinks.length}>
            {paymentLinks.length === 0 ? (
              <EmptyCard message="No payment links yet" cta="Create one" onCta={() => onSendMessage('Create a payment link')} />
            ) : (
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {paymentLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-foreground">{link.label || `${fmtAmount(link.amount)} link`}</p>
                      <p className="font-mono text-[11px] text-muted">audric.ai/pay/{link.slug}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-foreground">{fmtAmount(link.amount)}</p>
                      <StatusBadge status={link.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Invoices" count={invoices.length}>
            {invoices.length === 0 ? (
              <EmptyCard message="No invoices yet" cta="Create one" onCta={() => onSendMessage('Create an invoice')} />
            ) : (
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-foreground">
                        {inv.label || (inv.recipientName ? `Invoice for ${inv.recipientName}` : `${fmtAmount(inv.amount)} invoice`)}
                      </p>
                      <p className="font-mono text-[11px] text-muted">audric.ai/invoice/{inv.slug}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-foreground">{fmtAmount(inv.amount)}</p>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent, warn, onClick }: { label: string; value: string; sub: string; accent?: boolean; warn?: boolean; prompt: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-border bg-surface px-3 py-3 text-left hover:border-border-bright transition group">
      <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted mb-1">{label}</p>
      <p className={`font-mono text-sm ${warn ? 'text-warning' : accent ? 'text-success' : 'text-foreground'}`}>{value}</p>
      <p className="text-[10px] text-dim mt-0.5">{sub}</p>
    </button>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">{title}</h3>
        {count > 0 && <span className="font-mono text-[9px] text-dim bg-surface border border-border rounded-full px-1.5 py-0.5">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorClass = status === 'paid' ? 'text-success' : status === 'pending' || status === 'active' ? 'text-info' : status === 'overdue' ? 'text-warning' : 'text-muted';
  return <span className={`font-mono text-[9px] tracking-[0.1em] uppercase ${colorClass}`}>{status}</span>;
}

function EmptyCard({ message, cta, onCta }: { message: string; cta: string; onCta: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
      <p className="text-sm text-muted mb-3">{message}</p>
      <button onClick={onCta} className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-[var(--n700)] transition">
        {cta}
      </button>
    </div>
  );
}
