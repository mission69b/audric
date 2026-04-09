'use client';

import { useZkLogin } from '@/components/auth/useZkLogin';

export function LandingNav() {
  const { login, status } = useZkLogin();
  const isLoading = status === 'redirecting' || status === 'loading';

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-5 sm:px-10 lg:px-16 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
      <button
        onClick={() => { window.location.href = '/'; }}
        className="font-mono text-[13px] font-medium text-foreground cursor-pointer hover:opacity-70 transition"
      >
        Audric
      </button>

      <div className="flex items-center gap-5 sm:gap-6">
        <a href="#passport" className="hidden sm:block font-mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-foreground transition">
          Passport
        </a>
        <a href="#copilot" className="hidden sm:block font-mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-foreground transition">
          Copilot
        </a>
        <a href="#store" className="hidden sm:block font-mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-foreground transition">
          Store
        </a>
        <a href="#pay" className="hidden sm:block font-mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-foreground transition">
          Pay
        </a>
        <button
          onClick={login}
          disabled={isLoading}
          className="bg-foreground text-background rounded-lg px-4 py-2 text-[10px] font-mono uppercase tracking-[0.1em] transition hover:opacity-80 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Connecting...' : 'Sign in with Google'}
        </button>
      </div>
    </nav>
  );
}
