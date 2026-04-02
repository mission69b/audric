'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useZkLogin } from './useZkLogin';
import { Spinner } from '@/components/ui/Spinner';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { status } = useZkLogin();

  useEffect(() => {
    if (status === 'unauthenticated' || status === 'expired') {
      router.replace('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  if (status === 'unauthenticated' || status === 'expired') {
    return null;
  }

  return <>{children}</>;
}
