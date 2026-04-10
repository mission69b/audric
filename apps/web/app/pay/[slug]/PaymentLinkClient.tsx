'use client';

import { useCallback, useEffect, useState } from 'react';
import { QrCode } from '@/components/dashboard/QrCode';
import { AudricMark } from '@/components/ui/AudricMark';

interface LinkData {
  slug: string;
  recipientAddress: string;
  recipientName: string | null;
  amount: number | null;
  label: string | null;
  memo: string | null;
  currency: string;
  status: 'active' | 'paid' | 'expired' | 'cancelled';
  paidAt: string | null;
  txDigest: string | null;
  expiresAt: string | null;
  createdAt: string;
}

type PageState = 'loading' | 'active' | 'paid' | 'expired' | 'cancelled' | 'not_found';

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PaymentLinkClient({ slug }: { slug: string }) {
  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<LinkData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/payment-links/${slug}`);
        if (!res.ok) {
          setState('not_found');
          return;
        }
        const link: LinkData = await res.json();
        if (link.status === 'paid') setState('paid');
        else if (link.status === 'expired') setState('expired');
        else if (link.status === 'cancelled') setState('cancelled');
        else setState('active');
        setData(link);
      } catch {
        setState('not_found');
      }
    }
    load();
  }, [slug]);

  const copyAddress = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(data.recipientAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const payUrl = typeof window !== 'undefined' ? `${window.location.origin}/pay/${slug}` : '';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <AudricMark size={20} />
          <span className="font-mono text-xs uppercase tracking-widest text-dim">Audric Pay</span>
        </div>

        {state === 'loading' && <LoadingState />}
        {state === 'active' && data && (
          <ActiveState data={data} payUrl={payUrl} copied={copied} onCopy={copyAddress} />
        )}
        {state === 'paid' && data && <PaidState data={data} />}
        {state === 'expired' && <ExpiredState />}
        {state === 'cancelled' && <CancelledState />}
        {state === 'not_found' && <NotFoundState />}
      </div>
    </div>
  );
}

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

function ActiveState({ data, payUrl, copied, onCopy }: {
  data: LinkData;
  payUrl: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const shortAddr = `${data.recipientAddress.slice(0, 8)}...${data.recipientAddress.slice(-6)}`;

  return (
    <div className="rounded-xl border border-border bg-surface/50 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 text-center">
        {data.label && (
          <div className="text-sm text-muted mb-1">{data.label}</div>
        )}
        {data.amount != null ? (
          <div className="text-3xl font-semibold font-mono text-foreground">
            ${fmtUsd(data.amount)}
          </div>
        ) : (
          <div className="text-lg text-foreground font-medium">Any amount</div>
        )}
        <div className="text-xs text-dim font-mono mt-1">{data.currency}</div>
      </div>

      {/* QR Code */}
      <div className="flex justify-center py-4">
        <div className="relative p-3 rounded-lg border border-border bg-background">
          <QrCode value={payUrl} size={180} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-foreground bg-background p-1 rounded">
              <AudricMark size={14} />
            </span>
          </div>
        </div>
      </div>

      {/* Recipient info */}
      <div className="px-6 py-4 space-y-3">
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-dim">To</span>
          <span className="text-foreground">
            {data.recipientName ?? shortAddr}
          </span>
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
      </div>

      {/* Actions */}
      <div className="px-6 pb-6 space-y-2">
        <button
          onClick={onCopy}
          className="w-full py-2.5 rounded-lg border border-border bg-background text-xs font-mono uppercase tracking-wider text-foreground hover:bg-surface transition"
        >
          {copied ? 'Copied!' : 'Copy Address'}
        </button>
      </div>
    </div>
  );
}

function PaidState({ data }: { data: LinkData }) {
  const txUrl = data.txDigest ? `https://suiscan.xyz/mainnet/tx/${data.txDigest}` : null;
  const shortDigest = data.txDigest ? `${data.txDigest.slice(0, 8)}...${data.txDigest.slice(-6)}` : null;

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-emerald-400/10 flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
          <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-foreground mb-1">Payment Complete</h2>
      {data.amount != null && (
        <div className="text-2xl font-mono font-semibold text-foreground mb-2">
          ${fmtUsd(data.amount)}
        </div>
      )}
      <p className="text-sm text-dim mb-4">
        {data.paidAt ? `Paid ${new Date(data.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'This payment has been completed.'}
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
      <h2 className="text-lg font-medium text-foreground mb-1">Link Expired</h2>
      <p className="text-sm text-dim">
        This payment link is no longer active. Please request a new one from the recipient.
      </p>
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
      <h2 className="text-lg font-medium text-foreground mb-1">Link Cancelled</h2>
      <p className="text-sm text-dim">
        This payment link has been cancelled by the recipient. Please request a new one.
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
        This payment link doesn&apos;t exist or has been removed.
      </p>
    </div>
  );
}
