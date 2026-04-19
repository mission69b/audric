'use client';

import { useEffect, useState } from 'react';
import type { ZkLoginStep } from '@/lib/zklogin';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

interface LoadingScreenProps {
  step: ZkLoginStep | null;
  error: string | null;
  onRetry?: () => void;
}

const STEPS: { key: ZkLoginStep; label: string }[] = [
  { key: 'jwt', label: 'Authenticated' },
  { key: 'salt', label: 'Resolving address' },
  { key: 'proof', label: 'Verifying identity' },
];

function stepIndex(step: ZkLoginStep | null): number {
  if (!step) return -1;
  if (step === 'done') return STEPS.length;
  return STEPS.findIndex((s) => s.key === step);
}

export function LoadingScreen({ step, error, onRetry }: LoadingScreenProps) {
  const currentIdx = stepIndex(step);
  const isDone = step === 'done';
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(() => setShowDone(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isDone]);

  const progress = Math.min(((currentIdx + 1) / STEPS.length) * 100, 100);

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 bg-surface-page">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-error-bg flex items-center justify-center text-error-solid">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-fg-primary">
              Something went wrong
            </h2>
            <p className="text-[13px] text-fg-secondary leading-relaxed">{error}</p>
          </div>
          {onRetry && (
            <Button variant="primary" size="lg" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </main>
    );
  }

  if (showDone) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 bg-surface-page">
        <div className="space-y-3 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-success-bg flex items-center justify-center text-success-solid">
            <Icon name="check" size={28} />
          </div>
          <h2 className="font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-fg-primary">
            You&apos;re all set
          </h2>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 bg-surface-page">
      <div className="w-full max-w-sm space-y-7">
        <h2 className="font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-center text-fg-primary">
          Signing you in…
        </h2>

        <div className="space-y-3.5">
          {STEPS.map((s, i) => {
            const isComplete = currentIdx > i;
            const isActive = currentIdx === i;

            return (
              <div key={s.key} className="flex items-center gap-3">
                {isComplete ? (
                  <div className="w-6 h-6 rounded-full bg-success-bg flex items-center justify-center text-success-solid shrink-0">
                    <Icon name="check" size={14} />
                  </div>
                ) : isActive ? (
                  <div className="w-6 h-6 flex items-center justify-center shrink-0">
                    <Spinner size="md" />
                  </div>
                ) : (
                  <div className="w-6 h-6 flex items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-fg-disabled" />
                  </div>
                )}
                <span
                  className={[
                    'font-mono text-[11px] tracking-[0.08em] uppercase',
                    isComplete || isActive ? 'text-fg-primary' : 'text-fg-muted',
                  ].join(' ')}
                >
                  {s.label}{isActive ? '…' : ''}
                </span>
              </div>
            );
          })}
        </div>

        <div className="h-1 w-full rounded-pill bg-border-subtle overflow-hidden">
          <div
            className="h-full rounded-pill bg-fg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </main>
  );
}
