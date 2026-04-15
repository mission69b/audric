'use client';

import { useState, useEffect, useMemo } from 'react';

interface PayPanelProps {
  address: string;
  jwt: string;
  onSendMessage: (text: string) => void;
}

interface Payment {
  id: string;
  slug: string;
  type: 'link' | 'invoice';
  amount: number | null;
  label: string | null;
  status: string;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
}

const METHOD_LABELS: Record<string, string> = {
  wallet_connect: 'via wallet',
  card: 'via card',
  manual: 'manual verify',
  qr: 'via QR',
};

function fmtAmount(amount: number | null): string {
  if (amount == null) return 'Variable';
  return `$${amount.toFixed(2)}`;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PayPanel({ address, jwt, onSendMessage }: PayPanelProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address || !jwt) { setLoading(false); return; }
    setLoading(true);
    const headers = { 'x-zklogin-jwt': jwt, 'x-sui-address': address };
    fetch('/api/payments', { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setPayments(Array.isArray(data) ? data : []))
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  }, [address, jwt]);

  const stats = useMemo(() => {
    const active = payments.filter((p) => p.status === 'active');
    const activeLinks = active.filter((p) => p.type === 'link').length;
    const activeInvoices = active.filter((p) => p.type === 'invoice').length;
    const paid = payments.filter((p) => p.status === 'paid');
    const received = paid.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const overdueCount = payments.filter((p) => p.status === 'overdue').length;
    return { activeLinks, activeInvoices, received, overdueCount, totalActive: active.length };
  }, [payments]);

  const recentItems = useMemo(() => {
    return payments.map((p) => {
      const isPaid = p.status === 'paid';
      const isInvoice = p.type === 'invoice';
      const methodLabel = isPaid && p.paymentMethod ? METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod : null;

      const titleParts = [
        p.label || (isInvoice ? 'Invoice' : 'Payment link'),
        isPaid ? `${fmtAmount(p.amount)} received` : fmtAmount(p.amount),
      ];

      const descParts = [
        `pay/${p.slug}`,
        methodLabel ?? (isPaid ? 'paid' : p.status),
        timeAgo(p.paidAt ?? p.createdAt),
        isPaid ? 'sitting in wallet' : null,
      ].filter(Boolean);

      return {
        id: p.id,
        icon: isPaid ? '✓' : isInvoice ? '📄' : '🔗',
        title: titleParts.join(' · '),
        desc: descParts.join(' · '),
        status: p.status,
        statusColor: isPaid ? 'text-success' : p.status === 'overdue' ? 'text-warning' : p.status === 'active' ? 'text-info' : 'text-muted',
        amount: p.amount != null ? `$${p.amount.toFixed(2)}` : null,
        prompt: isPaid
          ? `Show me the details of the ${fmtAmount(p.amount)} payment I received for ${p.label || 'this link'}`
          : `What is the status of my ${isInvoice ? 'invoice' : 'payment link'} for ${p.label || p.slug}?`,
        saveable: isPaid && (p.amount ?? 0) > 0,
        methodBadge: methodLabel,
      };
    });
  }, [payments]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-5">
      {/* Quick create strip */}
      <div className="flex gap-2">
        <button
          onClick={() => onSendMessage('Create a payment link for $50 USDC — label it logo design work')}
          className="flex-1 font-mono text-[11px] tracking-[0.08em] uppercase text-background bg-foreground rounded-full py-2.5 hover:opacity-90 transition text-center"
        >
          + Payment link
        </button>
        <button
          onClick={() => onSendMessage('Create an invoice for $500 for design work due May 1')}
          className="flex-1 font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full py-2.5 hover:bg-surface transition text-center"
        >
          + Invoice
        </button>
        <button
          onClick={() => onSendMessage('Show me my wallet address and QR code for receiving USDC')}
          className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2.5 hover:bg-surface transition"
        >
          QR
        </button>
      </div>

      {/* 4-stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Links" drill="Manage" value={String(stats.activeLinks)}
          sub={`active · ${payments.filter(p => p.type === 'link' && p.status === 'paid').length} paid`}
          onClick={() => onSendMessage('Show me all my active payment links and their status')}
        />
        <StatCard
          label="Invoices" drill="Manage" value={String(stats.activeInvoices)}
          sub={`active · ${stats.overdueCount} overdue`}
          warn={stats.overdueCount > 0}
          onClick={() => onSendMessage('Show me all my invoices and their payment status')}
        />
        <StatCard
          label="Received" drill="+ income" drillColor="text-success" value={fmtUsd(stats.received)}
          sub="total via links + invoices"
          accent={stats.received > 0}
          onClick={() => onSendMessage('How much have I received via payment links and invoices?')}
        />
        <StatCard
          label="API spend" drill="Breakdown" value="--"
          sub="today · 40+ services"
          onClick={() => onSendMessage('Show me my API spending breakdown — what services have I paid for today?')}
        />
      </div>

      {/* Where your income goes */}
      {stats.received > 0 && (
        <div className="rounded-lg border border-success/15 bg-success/[0.04] px-4 py-3">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-success mb-2">Where your income goes</p>
          <p className="text-[11px] text-dim leading-relaxed">
            Every payment received adds to <strong className="text-[var(--n400)]">balance.available</strong> immediately. Audric then offers to save it, direct it to a goal, or leave it as working capital — your choice, one tap.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onSendMessage(`Save my ${fmtUsd(stats.received)} received payment into NAVI savings`)}
              className="font-mono text-[9px] tracking-[0.06em] uppercase text-background bg-foreground px-3 py-1 rounded-full hover:opacity-90 transition"
            >
              Save {fmtUsd(stats.received)} →
            </button>
            <button
              onClick={() => onSendMessage(`Apply my ${fmtUsd(stats.received)} received payment toward my goal`)}
              className="font-mono text-[9px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1 rounded-full hover:bg-surface transition"
            >
              Goal →
            </button>
            <button
              onClick={() => onSendMessage(`Keep my ${fmtUsd(stats.received)} received payment in wallet as working capital`)}
              className="font-mono text-[9px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1 rounded-full hover:bg-surface transition"
            >
              Keep
            </button>
          </div>
        </div>
      )}

      {/* Unified Recent feed */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      ) : recentItems.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
          <p className="text-sm text-muted mb-3">No payment activity yet</p>
          <button
            onClick={() => onSendMessage('Create a payment link')}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-[var(--n700)] transition"
          >
            Create your first link
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim">Recent</p>
          {recentItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSendMessage(item.prompt)}
              className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-[var(--n700)] hover:border-border-bright transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm shrink-0">{item.icon}</span>
                <div className="min-w-0">
                  <p className="text-[12px] text-[var(--n300)] font-medium truncate">{item.title}</p>
                  <p className="text-[10px] text-dim truncate">{item.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {item.methodBadge && (
                  <span className="font-mono text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded bg-success/10 text-success whitespace-nowrap">
                    {item.methodBadge}
                  </span>
                )}
                {item.saveable && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSendMessage(`Save my ${item.amount} from this payment into NAVI savings`); }}
                    className="font-mono text-[9px] tracking-[0.06em] uppercase text-foreground border border-border px-2 py-0.5 rounded-full hover:bg-surface transition whitespace-nowrap"
                  >
                    Save it →
                  </button>
                )}
                <span className="text-border-bright text-lg">›</span>
              </div>
            </button>
          ))}

          {/* Recurring invoice upsell */}
          <button
            onClick={() => onSendMessage('Set up a recurring invoice — send $500 to my client on the 1st of every month')}
            className="w-full flex items-center gap-3 rounded-lg border border-dashed border-border bg-transparent px-4 py-3 text-left hover:border-border-bright transition"
          >
            <span className="text-[11px] shrink-0">⟳</span>
            <div className="min-w-0">
              <p className="text-[12px] text-dim font-medium">Automate recurring invoice</p>
              <p className="text-[10px] text-dim">Monthly client billing · trust ladder applies</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, drill, drillColor, value, sub, accent, warn, onClick }: {
  label: string; drill: string; drillColor?: string; value: string; sub: string; accent?: boolean; warn?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="rounded-lg border border-border bg-surface px-3 py-3 text-left hover:border-border-bright transition group">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted">{label}</p>
        <p className={`font-mono text-[9px] ${drillColor || 'text-dim'}`}>{drill} →</p>
      </div>
      <p className={`font-mono text-[28px] font-light ${warn ? 'text-warning' : accent ? 'text-success' : 'text-foreground'}`}>{value}</p>
      <p className="text-[10px] text-dim mt-0.5">{sub}</p>
    </button>
  );
}
