'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ActionResolver() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const type = searchParams.get('type');
    const amount = searchParams.get('amount');

    if (!type) {
      router.replace('/new');
      return;
    }

    switch (type) {
      case 'save': {
        const msg = amount ? `Save $${amount} USDC` : 'Save my idle USDC';
        router.replace(`/new?prefill=${encodeURIComponent(msg)}`);
        break;
      }
      case 'repay': {
        const msg = amount ? `Repay $${amount}` : 'Repay my debt';
        router.replace(`/new?prefill=${encodeURIComponent(msg)}`);
        break;
      }
      case 'briefing':
        router.replace('/new?prefill=' + encodeURIComponent('Give me my daily briefing'));
        break;
      case 'topup':
        router.replace('/settings?section=features');
        break;
      case 'goal': {
        const id = searchParams.get('id');
        const deposit = searchParams.get('deposit');
        const msg = deposit ? `Save $${deposit} toward my goal` : 'Show my savings goals';
        router.replace(`/new?prefill=${encodeURIComponent(msg)}`);
        break;
      }
      case 'cancel-dca': {
        router.replace('/settings?section=features');
        break;
      }
      default:
        router.replace('/new');
    }
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-dvh">
      <div className="animate-pulse text-muted text-sm">Redirecting...</div>
    </div>
  );
}

export default function ActionPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-dvh"><div className="animate-pulse text-muted text-sm">Loading...</div></div>}>
      <ActionResolver />
    </Suspense>
  );
}
