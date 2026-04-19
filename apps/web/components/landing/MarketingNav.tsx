// [PHASE 13] Marketing — sticky top nav for the public landing page.
// Replaces the old `LandingNav` (rewritten to match the marketing handoff).
//
// Behavior preserved from the old nav:
//   • Brand button reloads `/` (cheap "go home" since the landing page has
//     internal anchor scroll-state we want to reset)
//   • Right-side CTA invokes `useZkLogin().login` to start the zkLogin flow
//   • Disabled while status is `'redirecting'` or `'loading'`

'use client';

import { useZkLogin } from '@/components/auth/useZkLogin';

const NAV_LINKS = [
  { href: '#passport', label: 'Passport' },
  { href: '#intelligence', label: 'Intelligence' },
  { href: '#pay', label: 'Pay' },
  { href: '#store', label: 'Store' },
];

export function MarketingNav() {
  const { login, status } = useZkLogin();
  const isLoading = status === 'redirecting' || status === 'loading';

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-5 sm:px-8 py-5 border-b border-border-subtle bg-surface-page/95 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => {
          window.location.href = '/';
        }}
        className="text-[18px] font-medium tracking-[-0.01em] text-fg-primary cursor-pointer hover:opacity-70 transition"
      >
        Audric
      </button>

      <nav aria-label="Marketing" className="hidden sm:flex items-center gap-6">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-fg-secondary hover:text-fg-primary transition"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <button
        type="button"
        onClick={login}
        disabled={isLoading}
        className="inline-flex items-center gap-2 bg-fg-primary text-fg-inverse px-4 py-2.5 rounded-xs font-mono text-[11px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Connecting...' : 'Sign in with Google'}
      </button>
    </header>
  );
}
