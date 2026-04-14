'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AllowanceLowBannerProps {
  balance: number | null;
  enabled?: boolean;
}

const DISMISS_KEY = 'audric-allowance-low-dismissed';
const DISMISS_TTL = 48 * 60 * 60 * 1000;

export function AllowanceLowBanner({ balance, enabled = true }: AllowanceLowBannerProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (Date.now() - ts < DISMISS_TTL) return;
    }
    setDismissed(false);
  }, []);

  if (dismissed) return null;
  if (balance == null || balance >= 0.05) return null;

  const isPaused = balance <= 0;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div className={`px-4 py-2.5 flex items-center justify-between gap-3 text-[12px] border-b ${
      isPaused ? 'bg-warning/5 border-warning/20 text-warning' : 'bg-info/5 border-info/20 text-info'
    }`}>
      <p>
        {isPaused
          ? 'Your features are paused \u2014 morning briefing and alerts are off.'
          : `Features budget running low ($${balance.toFixed(2)} remaining).`}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/setup?topup=0.50"
          className="font-mono text-[10px] tracking-[0.08em] uppercase font-medium hover:underline"
        >
          {isPaused ? 'Top up to resume' : 'Top up $0.50'} &rarr;
        </Link>
        {!isPaused && enabled && (
          <button onClick={handleDismiss} className="opacity-60 hover:opacity-100 transition text-xs">
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
