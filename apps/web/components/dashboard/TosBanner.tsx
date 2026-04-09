'use client';

import { useState } from 'react';

interface TosBannerProps {
  onAccept: () => Promise<void>;
}

export function TosBanner({ onAccept }: TosBannerProps) {
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await onAccept();
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-surface border-t border-border px-4 py-3 safe-area-bottom">
      <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
        <p className="text-xs text-muted leading-relaxed flex-1">
          We&apos;ve updated our{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:opacity-70"
          >
            Terms of Service
          </a>{' '}
          with fee disclosures.
        </p>
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-background uppercase tracking-[0.05em] transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {accepting ? 'Accepting…' : 'Accept'}
        </button>
      </div>
    </div>
  );
}
