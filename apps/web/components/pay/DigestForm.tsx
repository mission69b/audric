'use client';

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
        onClick={() => setExpanded(true)}
        className="w-full text-center text-[10px] font-mono text-dim hover:text-foreground transition py-1"
      >
        I already sent payment →
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label className="block text-[10px] font-mono text-dim">
        Transaction digest
      </label>
      <input
        type="text"
        value={digest}
        onChange={(e) => setDigest(e.target.value)}
        placeholder="e.g. 5Kx9V3..."
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs font-mono text-foreground placeholder:text-dim/50 focus:outline-none focus:border-foreground/30"
        disabled={verifying}
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!digest.trim() || verifying}
          className="flex-1 py-2 rounded-lg border border-border bg-background text-xs font-mono uppercase tracking-wider text-foreground hover:bg-surface transition disabled:opacity-40"
        >
          {verifying ? 'Verifying...' : 'Verify'}
        </button>
        <button
          type="button"
          onClick={() => { setExpanded(false); setDigest(''); }}
          className="px-3 py-2 rounded-lg border border-border bg-background text-xs font-mono text-dim hover:text-foreground transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
