'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';

type VerifyState = 'loading' | 'success' | 'already' | 'expired' | 'error';

function VerifyShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center bg-surface-page">
      <div className="max-w-sm w-full space-y-5">{children}</div>
    </main>
  );
}

function PendingState() {
  return (
    <VerifyShell>
      <div className="mx-auto w-12 h-12 flex items-center justify-center text-fg-secondary">
        <Spinner size="lg" />
      </div>
      <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
        Verifying your email…
      </p>
    </VerifyShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<PendingState />}>
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

  if (state === 'loading') return <PendingState />;

  return (
    <VerifyShell>
      {(state === 'success' || state === 'already') && (
        <>
          <div className="mx-auto w-14 h-14 rounded-full bg-success-bg flex items-center justify-center text-success-solid">
            <Icon name="check" size={28} />
          </div>
          <div className="space-y-2">
            <h1 className="font-serif text-[32px] leading-[1.15] tracking-[-0.01em] text-fg-primary">
              Email verified.
            </h1>
            <p className="text-[13px] text-fg-secondary leading-relaxed">
              You now get 20 chat sessions per day. No marketing, no daily summaries — verification was the only reason we needed your email.
            </p>
          </div>
          <Link href="/new">
            <Button variant="primary" size="lg" className="w-full">
              Continue to dashboard
            </Button>
          </Link>
        </>
      )}

      {state === 'expired' && (
        <>
          <div className="space-y-2">
            <h1 className="font-serif text-[32px] leading-[1.15] tracking-[-0.01em] text-fg-primary">
              Link expired.
            </h1>
            <p className="text-[13px] text-fg-secondary leading-relaxed">
              This verification link has expired. Open the app and request a new one from Settings.
            </p>
          </div>
          <Link href="/new">
            <Button variant="primary" size="lg" className="w-full">
              Open Audric
            </Button>
          </Link>
        </>
      )}

      {state === 'error' && (
        <>
          <div className="mx-auto w-14 h-14 rounded-full bg-error-bg flex items-center justify-center text-error-solid">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="font-serif text-[32px] leading-[1.15] tracking-[-0.01em] text-fg-primary">
              Something went wrong.
            </h1>
            <p className="text-[13px] text-fg-secondary leading-relaxed">
              We couldn&apos;t verify your email. Your funds are safe — this is just a verification issue.
            </p>
          </div>
          <Link href="/new">
            <Button variant="primary" size="lg" className="w-full">
              Open Audric
            </Button>
          </Link>
        </>
      )}
    </VerifyShell>
  );
}
