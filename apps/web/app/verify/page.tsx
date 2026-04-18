'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AudricMark } from '@/components/ui/AudricMark';

type VerifyState = 'loading' | 'success' | 'already' | 'expired' | 'error';

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AudricMark size={32} animate className="mx-auto" />
          <p className="mt-4 text-sm text-muted animate-pulse">Verifying your email...</p>
        </main>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<VerifyState>('loading');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }

    fetch('/api/user/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setState(data.alreadyVerified ? 'already' : 'success');
        } else if (res.status === 410) {
          setState('expired');
        } else {
          setState('error');
        }
      })
      .catch(() => setState('error'));
  }, [token]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-4">
        {state === 'loading' && (
          <>
            <AudricMark size={32} animate className="mx-auto" />
            <p className="text-sm text-muted animate-pulse">Verifying your email...</p>
          </>
        )}

        {(state === 'success' || state === 'already') && (
          <>
            <div className="text-3xl">✓</div>
            <h1 className="text-xl font-semibold">Email verified.</h1>
            <p className="text-muted leading-relaxed">
              You now get 20 chat sessions per day. We&apos;ll only email you for critical
              health-factor alerts — never marketing or daily summaries.
            </p>
            <Link
              href="/new"
              className="inline-block rounded-lg bg-foreground px-6 py-3 font-semibold text-background transition hover:opacity-80"
            >
              Continue to dashboard
            </Link>
          </>
        )}

        {state === 'expired' && (
          <>
            <h1 className="text-xl font-semibold">Link expired.</h1>
            <p className="text-muted leading-relaxed">
              This verification link has expired. Open the app and request a new one from Settings.
            </p>
            <Link
              href="/new"
              className="inline-block rounded-lg bg-foreground px-6 py-3 font-semibold text-background transition hover:opacity-80"
            >
              Open Audric
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 className="text-xl font-semibold">Something went wrong.</h1>
            <p className="text-muted leading-relaxed">
              We couldn&apos;t verify your email. Your funds are safe — this is just a verification issue.
            </p>
            <Link
              href="/new"
              className="inline-block rounded-lg bg-foreground px-6 py-3 font-semibold text-background transition hover:opacity-80"
            >
              Open Audric
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
