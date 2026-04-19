'use client';

// [PHASE 12] PayClient — re-skin the public /pay/[slug] receipt screen.
//
// This is the only signed-out application surface, so the visuals lean on the
// marketing site's QR-receipt pattern: serif amount, mono eyebrows, light card
// shell, pulsing "Listening for payment" status indicator.
//
// Behavior preservation (Hard Rule 1 — no behavior change during re-skin):
//   • All hooks (useState/useEffect/useCallback) preserved verbatim — same
//     dependency arrays, same fetch URLs, same retry/poll cadence.
//   • All sub-components (PayButton, DigestForm, SuiPayQr, InvoiceHeader)
//     consumed with the same props.
//   • The 6-second poll on `/api/payments/${slug}/verify` and the wallet-
//     success retry-with-backoff (2s/3s/5s) flows are untouched.
//
// Visual updates:
//   • Replaced legacy raw color tokens (red-400/amber-400/emerald-400) with
//     the semantic error-* / warning-* / success-* tokens from globals.css.
//   • Pulsing detection dot uses bg-success-solid.
//   • Receipt card uses surface-card + border-subtle.
//   • Terminal-state icons use semantic foreground tokens.

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
  expiresAt?: string | null;
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-page text-fg-primary px-4 py-8">
      <div className={`w-full ${isInvoice ? 'max-w-md' : 'max-w-sm'}`}>
        {/* Brand header */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <AudricMark size={20} />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
            {headerLabel}
          </span>
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
            className="font-mono text-[10px] tracking-[0.08em] text-fg-muted hover:text-fg-primary transition"
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
    <div className="rounded-md border border-border-subtle bg-surface-card overflow-hidden shadow-[var(--shadow-flat)]">
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
            {data.label && (
              <div className="text-[13px] text-fg-secondary mb-1">{data.label}</div>
            )}
            <div className="font-serif text-[40px] leading-none tracking-[-0.02em] text-fg-primary">
              ${fmtUsd(data.amount ?? 0)}
            </div>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted mt-2">
              {data.currency}
            </div>
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
            <DetailRow label="To" value={data.recipientName ?? shortAddr} />
            {data.recipientName && <DetailRow label="Address" value={shortAddr} />}
            {data.memo && <DetailRow label="Memo" value={data.memo} />}
            {data.expiresAt && (
              <DetailRow
                label="Expires"
                value={new Date(data.expiresAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              />
            )}
          </>
        )}

        {isInvoice && <DetailRow label="Pay to" value={shortAddr} />}
        {data.memo && isInvoice && <DetailRow label="Note" value={data.memo} />}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-6 pb-2">
          <div className="font-mono text-[10px] text-error-fg bg-error-bg border border-error-border rounded-xs px-3 py-2">
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
          type="button"
          onClick={onCopy}
          className="w-full h-10 rounded-pill border border-border-strong bg-transparent font-mono text-[11px] tracking-[0.06em] uppercase text-fg-primary hover:bg-surface-sunken transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
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
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              detecting ? 'bg-success-solid animate-pulse' : 'bg-border-subtle'
            }`}
          />
          <span className="font-mono text-[10px] tracking-[0.06em] text-fg-muted">
            {detecting ? 'Checking for payment...' : 'Listening for payment'}
          </span>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center font-mono text-[11px]">
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg-primary">{value}</span>
    </div>
  );
}

/* ── Terminal States ─────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center">
      <div className="animate-pulse space-y-4">
        <div className="h-40 bg-surface-sunken rounded-md mx-auto w-40" />
        <div className="h-4 bg-surface-sunken rounded w-3/4 mx-auto" />
        <div className="h-4 bg-surface-sunken rounded w-1/2 mx-auto" />
      </div>
    </div>
  );
}

function PaidState({ data }: { data: PaymentData }) {
  const txUrl = data.txDigest ? `https://suiscan.xyz/mainnet/tx/${data.txDigest}` : null;
  const shortDigest = data.txDigest
    ? `${data.txDigest.slice(0, 8)}...${data.txDigest.slice(-6)}`
    : null;
  const isInvoice = data.type === 'invoice';

  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center shadow-[var(--shadow-flat)]">
      <div className="w-12 h-12 rounded-full bg-success-bg border border-success-border flex items-center justify-center mx-auto mb-4">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="text-success-solid"
        >
          <path
            d="M20 6L9 17L4 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="font-serif text-[20px] tracking-[-0.01em] text-fg-primary mb-1">
        {isInvoice ? 'Invoice Paid' : 'Payment Complete'}
      </h2>
      {data.amount != null && (
        <div className="font-serif text-[28px] leading-tight tracking-[-0.02em] text-fg-primary mb-1">
          ${fmtUsd(data.amount)}
        </div>
      )}
      {isInvoice && data.label && (
        <p className="font-mono text-[10px] text-fg-muted mb-2">{data.label}</p>
      )}
      {data.paymentMethod && (
        <span className="inline-block font-mono text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-xs bg-success-bg text-success-fg border border-success-border mb-3">
          {data.paymentMethod === 'wallet_connect'
            ? 'Wallet'
            : data.paymentMethod === 'manual'
              ? 'Manual'
              : data.paymentMethod}
        </span>
      )}
      <p className="text-[13px] text-fg-secondary mb-4">
        {data.paidAt
          ? `Paid ${new Date(data.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
          : 'This payment has been completed.'}
      </p>
      {txUrl && shortDigest && (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] text-info-fg hover:opacity-70 transition"
        >
          {shortDigest} ↗
        </a>
      )}
    </div>
  );
}

function ExpiredState() {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-warning-bg border border-warning-border flex items-center justify-center mx-auto mb-4">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="text-warning-solid"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8V12L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="font-serif text-[20px] tracking-[-0.01em] text-fg-primary mb-1">
        Expired
      </h2>
      <p className="text-[13px] text-fg-secondary">
        This payment link is no longer active. Please request a new one from the recipient.
      </p>
    </div>
  );
}

function CancelledState({ isInvoice }: { isInvoice: boolean }) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-sunken border border-border-subtle flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-fg-muted">
          <path
            d="M18 6L6 18M6 6L18 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h2 className="font-serif text-[20px] tracking-[-0.01em] text-fg-primary mb-1">
        {isInvoice ? 'Invoice Cancelled' : 'Link Cancelled'}
      </h2>
      <p className="text-[13px] text-fg-secondary">
        {isInvoice
          ? 'This invoice has been cancelled by the sender.'
          : 'This payment link has been cancelled by the recipient. Please request a new one.'}
      </p>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-sunken border border-border-subtle flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-fg-muted">
          <path
            d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h2 className="font-serif text-[20px] tracking-[-0.01em] text-fg-primary mb-1">
        Not Found
      </h2>
      <p className="text-[13px] text-fg-secondary">
        This payment doesn&apos;t exist or has been removed.
      </p>
    </div>
  );
}
