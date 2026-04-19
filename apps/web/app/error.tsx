'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error boundary]', error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center bg-surface-page">
      <div className="max-w-sm w-full space-y-5">
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted">
          Error
        </p>
        <h1 className="font-serif text-[36px] leading-[1.1] tracking-[-0.01em] text-fg-primary">
          Something broke.
        </h1>
        <p className="text-[13px] text-fg-secondary leading-relaxed">
          We hit an unexpected error. Your funds are safe — this is a display issue only.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Button variant="primary" size="lg" onClick={reset}>
            Try again
          </Button>
          <Link href="/new" className="contents">
            <Button variant="secondary" size="lg" className="w-full">
              Go to dashboard
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
