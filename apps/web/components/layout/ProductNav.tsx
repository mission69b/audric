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
    <nav className="flex items-center justify-between px-6 py-4 w-full max-w-5xl mx-auto">
      <Link href="/" className="font-mono font-semibold text-foreground tracking-tight text-lg uppercase">
        Audric
      </Link>

      <div className="hidden md:flex items-center gap-6">
        {products.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className={`text-sm transition ${
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
        className="bg-foreground text-background rounded-lg px-4 py-2 text-xs font-mono uppercase tracking-wide transition hover:opacity-80 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Connecting...' : 'Sign in'}
      </button>
    </nav>
  );
}
