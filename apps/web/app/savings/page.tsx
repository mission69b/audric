'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProductNav } from '@/components/layout/ProductNav';
import { useZkLogin } from '@/components/auth/useZkLogin';

export default function SavingsPage() {
  const router = useRouter();
  const { status, login } = useZkLogin();
  const isLoading = status === 'redirecting' || status === 'loading';

  useEffect(() => {
    if (status === 'authenticated') router.replace('/new');
  }, [status, router]);

  return (
    <main className="flex flex-1 flex-col">
      <ProductNav />

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center max-w-2xl mx-auto">
        <div className="space-y-6">
          <h1 className="font-display text-4xl tracking-tight text-foreground">
            Earn yield on USDC
          </h1>
          <p className="font-mono text-5xl tracking-tight text-foreground">
            4.86% APY
          </p>
          <p className="text-muted text-base leading-relaxed max-w-md mx-auto">
            Your idle USDC earns automatically via NAVI Protocol. No lock-ups, withdraw anytime.
          </p>
        </div>

        <div className="mt-16 space-y-12 w-full max-w-sm">
          <div className="space-y-6 text-left">
            <h2 className="text-xs font-mono uppercase tracking-widest text-dim">How it works</h2>
            <ol className="space-y-4">
              {[
                'Sign in with Google',
                'Deposit USDC',
                'Earn yield automatically',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="font-mono text-sm text-dim w-5 shrink-0">{i + 1}.</span>
                  <span className="text-sm text-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <button
            onClick={login}
            disabled={isLoading}
            className="w-full bg-foreground text-background rounded-lg px-6 py-4 text-sm font-semibold uppercase tracking-wide transition hover:opacity-80 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Connecting...' : 'Get started'}
          </button>

          <p className="text-xs text-dim font-mono text-center">
            Fees: 0.1% on deposit. Withdrawals are free.
          </p>
        </div>
      </div>
    </main>
  );
}
