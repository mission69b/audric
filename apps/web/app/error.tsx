'use client';

import { useEffect } from 'react';

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
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Something broke.</h1>
        <p className="text-muted leading-relaxed">
          We hit an unexpected error. Your funds are safe — this is a display issue only.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={reset}
            className="rounded-lg bg-foreground px-6 py-3 font-semibold text-background transition hover:opacity-80"
          >
            Try again
          </button>
          <a
            href="/new"
            className="rounded-lg border border-border px-6 py-3 font-semibold text-foreground transition hover:bg-surface"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
