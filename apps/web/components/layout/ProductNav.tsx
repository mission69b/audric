'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useZkLogin } from '@/components/auth/useZkLogin';
// Ordered by S.18 product taxonomy: Audric Finance ops first
// (Savings · Swap · Credit), then Audric Pay ops (Send · Receive · Pay).
// `/pay` is the payment-link surface, kept last to avoid label-collision
// with the Audric Pay product brand at first glance.
const products = [
  { label: 'Savings', href: '/savings' },
  { label: 'Swap', href: '/swap' },
  { label: 'Credit', href: '/credit' },
  { label: 'Send', href: '/send' },
  { label: 'Receive', href: '/receive' },
  { label: 'Pay', href: '/pay' },
] as const;

export function ProductNav() {
  const pathname = usePathname();
  const { login, status } = useZkLogin();
  const isLoading = status === 'redirecting' || status === 'loading';

  return (
    <nav className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-2 w-full max-w-5xl mx-auto">
      <button
        onClick={() => { window.location.href = '/'; }}
        className="inline-flex items-center min-h-[44px] font-mono text-base font-bold tracking-wide text-fg-primary uppercase hover:opacity-70 transition cursor-pointer"
      >
        Audric
        <span className="text-[9px] uppercase tracking-widest font-medium text-fg-secondary border border-border-subtle rounded px-1.5 py-0.5 leading-none ml-2">
          beta
        </span>
      </button>

      <div className="hidden sm:flex items-center gap-4">
        {products.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={`inline-flex items-center min-h-[44px] px-1 text-sm whitespace-nowrap transition ${
              pathname === href ? 'text-fg-primary' : 'text-fg-secondary hover:text-fg-primary'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <button
        onClick={login}
        disabled={isLoading}
        className="shrink-0 inline-flex items-center justify-center min-h-[44px] bg-fg-primary text-fg-inverse rounded-lg px-4 text-xs font-mono uppercase tracking-wide transition hover:opacity-80 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Connecting...' : 'Sign in'}
      </button>
    </nav>
  );
}
