'use client';

import { useState, useEffect } from 'react';

interface PayPanelProps {
  address: string;
  jwt: string;
  onSendMessage: (text: string) => void;
}

interface PaymentLink {
  id: string;
  slug: string;
  amount: number;
  memo?: string;
  status: string;
  createdAt: string;
}

interface Invoice {
  id: string;
  slug: string;
  amount: number;
  memo?: string;
  status: string;
  createdAt: string;
}

export function PayPanel({ address, jwt, onSendMessage }: PayPanelProps) {
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address || !jwt) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/payment-links?address=${address}`, { headers: { 'x-zklogin-jwt': jwt } }).then((r) => r.ok ? r.json() : { items: [] }),
      fetch(`/api/invoices?address=${address}`, { headers: { 'x-zklogin-jwt': jwt } }).then((r) => r.ok ? r.json() : { items: [] }),
    ]).then(([linksData, invoicesData]) => {
      setPaymentLinks(linksData.items ?? []);
      setInvoices(invoicesData.items ?? []);
    }).finally(() => setLoading(false));
  }, [address, jwt]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-foreground">Pay</h2>
        <div className="flex gap-2">
          <button
            onClick={() => onSendMessage('Create a payment link for $10 USDC')}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
          >
            + Link
          </button>
          <button
            onClick={() => onSendMessage('Create an invoice for $50 USDC')}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
          >
            + Invoice
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Payment Links */}
          <Section title="Payment Links" count={paymentLinks.length}>
            {paymentLinks.length === 0 ? (
              <EmptyCard message="No payment links yet" cta="Create one" onCta={() => onSendMessage('Create a payment link')} />
            ) : (
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {paymentLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-foreground">{link.memo || `$${link.amount.toFixed(2)} link`}</p>
                      <p className="font-mono text-[11px] text-muted">audric.ai/pay/{link.slug}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-foreground">${link.amount.toFixed(2)}</p>
                      <StatusBadge status={link.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Invoices */}
          <Section title="Invoices" count={invoices.length}>
            {invoices.length === 0 ? (
              <EmptyCard message="No invoices yet" cta="Create one" onCta={() => onSendMessage('Create an invoice')} />
            ) : (
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-foreground">{inv.memo || `$${inv.amount.toFixed(2)} invoice`}</p>
                      <p className="font-mono text-[11px] text-muted">audric.ai/invoice/{inv.slug}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-foreground">${inv.amount.toFixed(2)}</p>
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

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">{title}</h3>
        {count > 0 && (
          <span className="font-mono text-[9px] text-dim bg-surface border border-border rounded-full px-1.5 py-0.5">{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorClass = status === 'paid' ? 'text-success' : status === 'pending' || status === 'active' ? 'text-info' : 'text-muted';
  return (
    <span className={`font-mono text-[9px] tracking-[0.1em] uppercase ${colorClass}`}>
      {status}
    </span>
  );
}

function EmptyCard({ message, cta, onCta }: { message: string; cta: string; onCta: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
      <p className="text-sm text-muted mb-3">{message}</p>
      <button
        onClick={onCta}
        className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-[var(--n700)] transition"
      >
        {cta}
      </button>
    </div>
  );
}
