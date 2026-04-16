'use client';

import { useCallback, useEffect, useState } from 'react';
import { AudricMark } from '@/components/ui/AudricMark';
import { PayButton } from './PayButton';
import { DigestForm } from './DigestForm';
import { SuiPayQr } from './SuiPayQr';
import { InvoiceHeader } from './InvoiceHeader';

interface LineItem {
  description: string;
  amount: number;
  quantity?: number;
}

interface PaymentData {
  slug: string;
  nonce: string;
  type: 'link' | 'invoice';
  recipientAddress: string;
  recipientName: string | null;
  amount: number | null;
  currency: string;
  label: string | null;
  memo: string | null;
  status: string;
  paymentMethod: string | null;
  paidAt: string | null;
  paidBy: string | null;
  txDigest: string | null;
  // link-specific
  expiresAt?: string | null;
  // invoice-specific
  lineItems?: LineItem[] | null;
  dueDate?: string | null;
  billToName?: string | null;
  billToEmail?: string | null;
  senderName?: string | null;
  createdAt: string;
}

type PageState = 'loading' | 'active' | 'paid' | 'expired' | 'overdue' | 'cancelled' | 'not_found';

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PayClient({ slug }: { slug: string }) {
  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<PaymentData | null>(null);
  const [copied, setCopied] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyStatus = useCallback((payment: PaymentData) => {
    const s = payment.status;
    if (s === 'paid') setState('paid');
    else if (s === 'expired') setState('expired');
    else if (s === 'overdue') setState('overdue');
    else if (s === 'cancelled') setState('cancelled');
    else setState('active');
    setData(payment);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/payments/${slug}`);
        if (!res.ok) { setState('not_found'); return; }
        const payment: PaymentData = await res.json();
        applyStatus(payment);
      } catch {
        setState('not_found');
      }
    }
    load();
  }, [slug, applyStatus]);

  // Poll every 6s while active/overdue — checks the on-chain Payment Kit registry
  useEffect(() => {
    if (state !== 'active' && state !== 'overdue') return;
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      setDetecting(true);
      try {
        const res = await fetch(`/api/payments/${slug}/verify`, { method: 'POST' });
        if (!res.ok) return;
        const result = await res.json() as { status: string; paidAt: string | null; txDigest?: string; amountReceived?: number };
        if (result.status === 'paid') {
          setData((prev) => prev ? {
            ...prev,
            status: 'paid',
            paidAt: result.paidAt,
            txDigest: result.txDigest ?? null,
          } : prev);
          setState('paid');
          stopped = true;
        }
      } catch { /* silent */ } finally {
        setDetecting(false);
      }
    };

    const interval = setInterval(poll, 6_000);
    return () => { stopped = true; clearInterval(interval); };
  }, [state, slug]);

  const copyAddress = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(data.recipientAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const handleWalletSuccess = useCallback(async (digest: string, sender: string) => {
    const verify = async (): Promise<{ status: string; paidAt?: string; txDigest?: string; error?: string }> => {
      const res = await fetch(`/api/payments/${slug}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digest, paymentMethod: 'wallet_connect' }),
      });
      return res.json();
    };

    const delays = [2000, 3000, 5000];
    for (let i = 0; i <= delays.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, delays[i - 1]));
      try {
        const result = await verify();
        if (result.status === 'paid') {
          setData((prev) => prev ? {
            ...prev,
            status: 'paid',
            paidAt: result.paidAt ?? new Date().toISOString(),
            paidBy: sender,
            txDigest: digest,
            paymentMethod: 'wallet_connect',
          } : prev);
          setState('paid');
          return;
        }
        if (i === delays.length) {
          setError(result.error ?? 'Verification failed — the transaction was sent but could not be confirmed. Please submit the digest manually.');
        }
      } catch {
        if (i === delays.length) {
          setError('Transaction sent, verifying... Please submit the digest manually if this persists.');
        }
      }
    }
  }, [slug]);

  const handleDigestSuccess = useCallback((digest: string) => {
    setData((prev) => prev ? {
      ...prev,
      status: 'paid',
      paidAt: new Date().toISOString(),
      txDigest: digest,
      paymentMethod: 'manual',
    } : prev);
    setState('paid');
    setError(null);
  }, []);

  const isInvoice = data?.type === 'invoice';
  const headerLabel = isInvoice ? 'Invoice' : 'Audric Pay';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4 py-8">
      <div className={`w-full ${isInvoice ? 'max-w-md' : 'max-w-sm'}`}>
        {/* Brand header */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <AudricMark size={20} />
          <span className="font-mono text-xs uppercase tracking-widest text-dim">{headerLabel}</span>
        </div>

        {state === 'loading' && <LoadingState />}

        {(state === 'active' || state === 'overdue') && data && (
          <ActivePayment
            data={data}
            overdue={state === 'overdue'}
            copied={copied}
            onCopy={copyAddress}
            detecting={detecting}
            error={error}
            onWalletSuccess={handleWalletSuccess}
            onDigestSuccess={handleDigestSuccess}
            onError={setError}
          />
        )}

        {state === 'paid' && data && <PaidState data={data} />}
        {state === 'expired' && <ExpiredState />}
        {state === 'cancelled' && <CancelledState isInvoice={isInvoice} />}
        {state === 'not_found' && <NotFoundState />}

        {/* Acquisition CTA */}
        <div className="mt-8 text-center">
          <a
            href="https://audric.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-dim hover:text-foreground transition"
          >
            Powered by Audric — Your money, handled. →
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Active Payment ─────────────────────────────────────────────── */

function ActivePayment({
  data,
  overdue,
  copied,
  onCopy,
  detecting,
  error,
  onWalletSuccess,
  onDigestSuccess,
  onError,
}: {
  data: PaymentData;
  overdue: boolean;
  copied: boolean;
  onCopy: () => void;
  detecting: boolean;
  error: string | null;
  onWalletSuccess: (digest: string, sender: string) => void;
  onDigestSuccess: (digest: string) => void;
  onError: (error: string) => void;
}) {
  const isInvoice = data.type === 'invoice';
  const shortAddr = `${data.recipientAddress.slice(0, 8)}...${data.recipientAddress.slice(-6)}`;

  return (
    <div className="rounded-xl border border-border bg-surface/50 overflow-hidden">
      <div className="px-6 pt-6 pb-4">
        {isInvoice ? (
          <InvoiceHeader
            label={data.label ?? 'Invoice'}
            amount={data.amount ?? 0}
            currency={data.currency}
            lineItems={(data.lineItems ?? []) as { description: string; amount: number; quantity?: number }[]}
            senderName={data.recipientName}
            recipientName={data.billToName ?? null}
            recipientEmail={data.billToEmail ?? null}
            dueDate={data.dueDate ?? null}
            createdAt={data.createdAt}
            overdue={overdue}
          />
        ) : (
          <div className="text-center">
            {data.label && <div className="text-sm text-muted mb-1">{data.label}</div>}
            <div className="text-3xl font-semibold font-mono text-foreground">
              ${fmtUsd(data.amount ?? 0)}
            </div>
            <div className="text-xs text-dim font-mono mt-1">{data.currency}</div>
          </div>
        )}
      </div>

      {/* QR Code */}
      <div className="flex justify-center py-4">
        <SuiPayQr
          recipientAddress={data.recipientAddress}
          amount={data.amount}
          nonce={data.nonce}
          label={data.label}
          memo={data.memo}
          size={isInvoice ? 140 : 180}
        />
      </div>

      {/* Recipient / details */}
      <div className="px-6 py-3 space-y-2">
        {!isInvoice && (
          <>
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-dim">To</span>
              <span className="text-foreground">{data.recipientName ?? shortAddr}</span>
            </div>
            {data.recipientName && (
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-dim">Address</span>
                <span className="text-foreground">{shortAddr}</span>
              </div>
            )}
            {data.memo && (
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-dim">Memo</span>
                <span className="text-foreground">{data.memo}</span>
              </div>
            )}
            {data.expiresAt && (
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-dim">Expires</span>
                <span className="text-foreground">
                  {new Date(data.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            )}
          </>
        )}

        {isInvoice && (
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-dim">Pay to</span>
            <span className="text-foreground">{shortAddr}</span>
          </div>
        )}

        {data.memo && isInvoice && (
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-dim">Note</span>
            <span className="text-foreground">{data.memo}</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-6 pb-2">
          <div className="text-[10px] font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 pb-6 space-y-2">
        <PayButton
          recipientAddress={data.recipientAddress}
          amount={data.amount}
          nonce={data.nonce}
          slug={data.slug}
          onSuccess={onWalletSuccess}
          onError={onError}
        />

        <button
          onClick={onCopy}
          className="w-full py-2.5 rounded-lg border border-border bg-background text-xs font-mono uppercase tracking-wider text-foreground hover:bg-surface transition"
        >
          {copied ? 'Copied!' : 'Copy Address'}
        </button>

        <DigestForm
          slug={data.slug}
          onSuccess={onDigestSuccess}
          onError={onError}
        />

        {/* Detection indicator */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${detecting ? 'bg-emerald-400 animate-pulse' : 'bg-border'}`} />
          <span className="text-[10px] font-mono text-dim">
            {detecting ? 'Checking for payment...' : 'Listening for payment'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Terminal States ─────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
      <div className="animate-pulse space-y-4">
        <div className="h-40 bg-border/30 rounded-lg mx-auto w-40" />
        <div className="h-4 bg-border/30 rounded w-3/4 mx-auto" />
        <div className="h-4 bg-border/30 rounded w-1/2 mx-auto" />
      </div>
    </div>
  );
}

function PaidState({ data }: { data: PaymentData }) {
  const txUrl = data.txDigest ? `https://suiscan.xyz/mainnet/tx/${data.txDigest}` : null;
  const shortDigest = data.txDigest ? `${data.txDigest.slice(0, 8)}...${data.txDigest.slice(-6)}` : null;
  const isInvoice = data.type === 'invoice';

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-emerald-400/10 flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
          <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-foreground mb-1">
        {isInvoice ? 'Invoice Paid' : 'Payment Complete'}
      </h2>
      {data.amount != null && (
        <div className="text-2xl font-mono font-semibold text-foreground mb-1">
          ${fmtUsd(data.amount)}
        </div>
      )}
      {isInvoice && data.label && (
        <p className="text-xs text-dim font-mono mb-2">{data.label}</p>
      )}
      {data.paymentMethod && (
        <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-400 mb-3">
          {data.paymentMethod === 'wallet_connect' ? 'Wallet' : data.paymentMethod === 'manual' ? 'Manual' : data.paymentMethod}
        </span>
      )}
      <p className="text-sm text-dim mb-4">
        {data.paidAt
          ? `Paid ${new Date(data.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
          : 'This payment has been completed.'}
      </p>
      {txUrl && shortDigest && (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-info text-xs font-mono hover:opacity-70 transition"
        >
          {shortDigest} ↗
        </a>
      )}
    </div>
  );
}

function ExpiredState() {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-amber-400">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8V12L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-foreground mb-1">Expired</h2>
      <p className="text-sm text-dim">
        This payment link is no longer active. Please request a new one from the recipient.
      </p>
    </div>
  );
}

function CancelledState({ isInvoice }: { isInvoice: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-border/30 flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-dim">
          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-foreground mb-1">
        {isInvoice ? 'Invoice Cancelled' : 'Link Cancelled'}
      </h2>
      <p className="text-sm text-dim">
        {isInvoice
          ? 'This invoice has been cancelled by the sender.'
          : 'This payment link has been cancelled by the recipient. Please request a new one.'}
      </p>
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
      <p className="text-sm text-dim">
        This payment doesn&apos;t exist or has been removed.
      </p>
    </div>
  );
}
