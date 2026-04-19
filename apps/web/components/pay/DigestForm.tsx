'use client';

// [PHASE 12] DigestForm — re-skin the manual transaction-digest fallback
// inside the /pay/[slug] receipt. Lets a payer paste a Sui tx digest if the
// auto-poller didn't pick up their payment.
//
// Behavior preservation: identical state machine (collapsed → expanded → form
// submit → fetch /api/payments/<slug>/verify → onSuccess/onError). Same
// validation regex (`^[A-Za-z0-9+/=]{32,88}$`).

import { useState } from 'react';

interface DigestFormProps {
  slug: string;
  onSuccess: (digest: string) => void;
  onError: (error: string) => void;
}

export function DigestForm({ slug, onSuccess, onError }: DigestFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [digest, setDigest] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = digest.trim();
    if (!trimmed) return;

    if (!/^[A-Za-z0-9+/=]{32,88}$/.test(trimmed)) {
      onError('Invalid transaction digest format');
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch(`/api/payments/${slug}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digest: trimmed, paymentMethod: 'manual' }),
      });

      const result = await res.json();

      if (result.status === 'paid') {
        onSuccess(result.txDigest ?? trimmed);
      } else if (result.error) {
        onError(result.error);
      } else {
        onError('Could not verify this transaction. Please check the digest and try again.');
      }
    } catch {
      onError('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full text-center font-mono text-[10px] tracking-[0.06em] text-fg-muted hover:text-fg-primary transition py-1"
      >
        I already sent payment →
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label className="block font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
        Transaction digest
      </label>
      <input
        type="text"
        value={digest}
        onChange={(e) => setDigest(e.target.value)}
        placeholder="e.g. 5Kx9V3..."
        className="w-full h-10 px-3 rounded-xs border border-border-subtle bg-surface-page font-mono text-[11px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-border-focus"
        disabled={verifying}
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!digest.trim() || verifying}
          className="flex-1 h-10 rounded-pill border border-border-strong bg-transparent font-mono text-[11px] tracking-[0.06em] uppercase text-fg-primary hover:bg-surface-sunken transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          {verifying ? 'Verifying...' : 'Verify'}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setDigest('');
          }}
          className="h-10 px-4 rounded-pill border border-border-subtle bg-transparent font-mono text-[11px] tracking-[0.06em] uppercase text-fg-secondary hover:text-fg-primary hover:bg-surface-sunken transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
