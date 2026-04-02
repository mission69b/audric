'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProductNav } from '@/components/layout/ProductNav';
import { useZkLogin } from '@/components/auth/useZkLogin';

export default function ReceivePage() {
  const router = useRouter();
  const { status } = useZkLogin();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/new');
  }, [status, router]);

  return (
    <main className="flex flex-1 flex-col">
      <ProductNav />

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center max-w-2xl mx-auto">
        <div className="space-y-6">
          <div className="inline-block rounded-full border border-current px-4 py-1 text-xs font-mono uppercase tracking-widest text-dim">
            Coming soon
          </div>
          <h1 className="font-display text-4xl tracking-tight text-foreground">
            Accept payments anywhere
          </h1>
          <p className="text-muted text-base leading-relaxed max-w-md mx-auto">
            QR codes, payment links, and invoices. Let anyone send you USDC — no app required on their end.
          </p>
        </div>

        <div className="mt-16 space-y-12 w-full max-w-sm">
          <div className="space-y-6 text-left">
            <h2 className="text-xs font-mono uppercase tracking-widest text-dim">What to expect</h2>
            <ol className="space-y-4">
              {[
                'Generate QR codes and payment links',
                'Share via any messaging app',
                'Funds arrive in your balance instantly',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="font-mono text-sm text-dim w-5 shrink-0">{i + 1}.</span>
                  <span className="text-sm text-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="text-xs text-dim font-mono text-center">
            We&apos;re building Receive. Sign up to get notified.
          </p>
        </div>
      </div>
    </main>
  );
}
