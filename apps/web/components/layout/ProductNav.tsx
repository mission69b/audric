'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useZkLogin } from '@/components/auth/useZkLogin';

const products = [
  { label: 'Savings', href: '/savings' },
  { label: 'Pay', href: '/pay' },
  { label: 'Send', href: '/send' },
  { label: 'Credit', href: '/credit' },
  { label: 'Receive', href: '/receive' },
] as const;

export function ProductNav() {
  const pathname = usePathname();
  const { login, status } = useZkLogin();
  const isLoading = status === 'redirecting' || status === 'loading';

  return (
    <nav className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-2 w-full max-w-5xl mx-auto">
      <Link href="/" className="inline-flex items-center min-h-[44px] font-mono font-semibold text-foreground tracking-tight text-lg uppercase">
        Audric
      </Link>

      <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto scrollbar-none min-w-0">
        {products.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={`inline-flex items-center min-h-[44px] px-2 sm:px-1 text-xs sm:text-sm whitespace-nowrap transition ${
              pathname === href ? 'text-foreground' : 'text-muted hover:text-foreground'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <button
        onClick={login}
        disabled={isLoading}
        className="shrink-0 inline-flex items-center justify-center min-h-[44px] bg-foreground text-background rounded-lg px-4 text-xs font-mono uppercase tracking-wide transition hover:opacity-80 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Connecting...' : 'Sign in'}
      </button>
    </nav>
  );
}
