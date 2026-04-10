'use client';

import { useCallback, useEffect, useState } from 'react';
import { AudricMark } from '@/components/ui/AudricMark';

interface InvoiceItem {
  description: string;
  amount: number;
  quantity?: number;
}

interface InvoiceData {
  slug: string;
  senderAddress: string;
  senderName: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  amount: number;
  currency: string;
  label: string;
  items: InvoiceItem[];
  memo: string | null;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paidAt: string | null;
  txDigest: string | null;
  dueDate: string | null;
  createdAt: string;
}

type PageState = 'loading' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'not_found';

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InvoiceClient({ slug }: { slug: string }) {
  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<InvoiceData | null>(null);
  const [copied, setCopied] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const applyStatus = useCallback((inv: InvoiceData) => {
    if (inv.status === 'paid') setState('paid');
    else if (inv.status === 'overdue') setState('overdue');
    else if (inv.status === 'cancelled') setState('cancelled');
    else setState('pending');
    setData(inv);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/invoices/${slug}`);
        if (!res.ok) { setState('not_found'); return; }
        const inv: InvoiceData = await res.json();
        applyStatus(inv);
      } catch {
        setState('not_found');
      }
    }
    load();
  }, [slug, applyStatus]);

  // Poll every 8s while pending/overdue — checks Sui on-chain for matching USDC transfer
  useEffect(() => {
    if (state !== 'pending' && state !== 'overdue') return;
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      setDetecting(true);
      try {
        const res = await fetch(`/api/invoices/${slug}/verify`, { method: 'POST' });
        if (!res.ok) return;
        const result = await res.json() as { status: string; paidAt: string | null; txDigest?: string };
        if (result.status === 'paid' && data) {
          setData((prev) => prev ? { ...prev, status: 'paid', paidAt: result.paidAt, txDigest: result.txDigest ?? null } : prev);
          setState('paid');
          stopped = true;
        }
      } catch { /* silent */ } finally {
        setDetecting(false);
      }
    };

    const interval = setInterval(poll, 8_000);
    return () => { stopped = true; clearInterval(interval); };
  }, [state, slug, data]);

  const copyAddress = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(data.senderAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <AudricMark size={20} />
          <span className="font-mono text-xs uppercase tracking-widest text-dim">Invoice</span>
        </div>

        {state === 'loading' && <LoadingState />}
        {(state === 'pending' || state === 'overdue') && data && (
          <PendingInvoice data={data} overdue={state === 'overdue'} copied={copied} onCopy={copyAddress} detecting={detecting} />
        )}
        {state === 'paid' && data && <PaidInvoice data={data} />}
        {state === 'cancelled' && <CancelledState />}
        {state === 'not_found' && <NotFoundState />}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-8">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-border/30 rounded w-2/3" />
        <div className="h-10 bg-border/30 rounded w-1/2" />
        <div className="h-4 bg-border/30 rounded w-full" />
        <div className="h-4 bg-border/30 rounded w-3/4" />
      </div>
    </div>
  );
}

function PendingInvoice({ data, overdue, copied, onCopy, detecting }: {
  data: InvoiceData;
  overdue: boolean;
  copied: boolean;
  onCopy: () => void;
  detecting: boolean;
}) {
  const shortAddr = `${data.senderAddress.slice(0, 8)}...${data.senderAddress.slice(-6)}`;

  return (
    <div className="rounded-xl border border-border bg-surface/50 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-dim">
            {new Date(data.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {overdue ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-400/10 text-red-400">Overdue</span>
          ) : (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-foreground/10 text-foreground">Pending</span>
          )}
        </div>
        <h1 className="text-lg font-medium text-foreground mb-1">{data.label}</h1>
        <div className="text-3xl font-semibold font-mono text-foreground">
          ${fmtUsd(data.amount)}
          <span className="text-sm text-dim ml-1">{data.currency}</span>
        </div>
      </div>

      {/* Line items */}
      {data.items.length > 0 && (
        <div className="px-6 pb-4">
          <div className="border-t border-border pt-3 space-y-2">
            {data.items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs font-mono">
                <span className="text-foreground">{item.description}</span>
                <span className="text-dim">${fmtUsd(item.amount * (item.quantity ?? 1))}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs font-mono pt-2 border-t border-border/50">
              <span className="text-foreground font-medium">Total</span>
              <span className="text-foreground font-medium">${fmtUsd(data.amount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Details */}
      <div className="px-6 pb-4 space-y-2">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-dim">From</span>
          <span className="text-foreground">{data.senderName ?? shortAddr}</span>
        </div>
        {data.recipientName && (
          <div className="flex justify-between text-xs font-mono">
            <span className="text-dim">To</span>
            <span className="text-foreground">{data.recipientName}</span>
          </div>
        )}
        {data.dueDate && (
          <div className="flex justify-between text-xs font-mono">
            <span className="text-dim">Due</span>
            <span className={overdue ? 'text-red-400' : 'text-foreground'}>
              {new Date(data.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
        {data.memo && (
          <div className="flex justify-between text-xs font-mono">
            <span className="text-dim">Note</span>
            <span className="text-foreground">{data.memo}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-mono">
          <span className="text-dim">Pay to</span>
          <span className="text-foreground">{shortAddr}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 pb-6 space-y-2">
        <button
          onClick={onCopy}
          className="w-full py-2.5 rounded-lg border border-border bg-background text-xs font-mono uppercase tracking-wider text-foreground hover:bg-surface transition"
        >
          {copied ? 'Copied!' : 'Copy Payment Address'}
        </button>
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${detecting ? 'bg-emerald-400 animate-pulse' : 'bg-border'}`} />
          <span className="text-[10px] font-mono text-dim">
            {detecting ? 'Checking for payment...' : 'Waiting for payment'}
          </span>
        </div>
      </div>
    </div>
  );
}

function PaidInvoice({ data }: { data: InvoiceData }) {
  const txUrl = data.txDigest ? `https://suiscan.xyz/mainnet/tx/${data.txDigest}` : null;
  const shortDigest = data.txDigest ? `${data.txDigest.slice(0, 8)}...${data.txDigest.slice(-6)}` : null;

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-emerald-400/10 flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
          <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-foreground mb-1">Invoice Paid</h2>
      <div className="text-2xl font-mono font-semibold text-foreground mb-1">${fmtUsd(data.amount)}</div>
      <p className="text-xs text-dim font-mono mb-4">{data.label}</p>
      {data.paidAt && (
        <p className="text-xs text-dim mb-2">
          Paid {new Date(data.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
      {txUrl && shortDigest && (
        <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-info text-xs font-mono hover:opacity-70 transition">
          {shortDigest} ↗
        </a>
      )}
    </div>
  );
}

function CancelledState() {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-border/30 flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-dim">
          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-foreground mb-1">Invoice Cancelled</h2>
      <p className="text-sm text-dim">This invoice has been cancelled by the sender.</p>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-border/30 flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-dim">
          <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-foreground mb-1">Not Found</h2>
      <p className="text-sm text-dim">This invoice doesn&apos;t exist or has been removed.</p>
    </div>
  );
}
