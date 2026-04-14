'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const EXAMPLE_ADDRESSES = [
  '0x7f2059fb1c395f4800809b4b97ed8e661535c8c55f89b1379b6b9d0208d2f6dc',
  '0xd77955eade33e1e8ec2cbe13db35e6e49d3c4543d74585df97db0db3e25cf946',
];

export default function ReportLandingPage() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = address.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
      setError('Enter a valid Sui address (0x followed by 64 hex characters)');
      return;
    }
    router.push(`/report/${trimmed}`);
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 min-h-screen">
      <div className="w-full max-w-lg space-y-10 text-center">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="font-[family-name:var(--font-instrument-serif)] text-4xl sm:text-5xl text-foreground tracking-tight">
            Wallet Intelligence
          </h1>
          <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto">
            Analyze any Sui wallet in seconds. Portfolio breakdown, yield efficiency,
            risk signals, and actionable suggestions — no sign-up required.
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setError(''); }}
              placeholder="0x..."
              className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 font-mono text-sm text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-foreground/20 transition"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-xl bg-foreground py-3 font-mono text-[11px] tracking-[0.1em] text-background uppercase hover:opacity-90 transition"
          >
            Analyze Wallet
          </button>
        </form>

        {/* Examples */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] tracking-wider text-dim uppercase">
            Or try an example
          </p>
          <div className="flex flex-col gap-2">
            {EXAMPLE_ADDRESSES.map((addr) => (
              <button
                key={addr}
                onClick={() => router.push(`/report/${addr}`)}
                className="rounded-lg border border-border px-3 py-2 font-mono text-xs text-muted hover:text-foreground hover:border-foreground/20 transition truncate"
              >
                {addr.slice(0, 6)}...{addr.slice(-6)}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-dim">
          Powered by{' '}
          <Link href="/" className="text-muted hover:text-foreground transition underline underline-offset-2">
            Audric
          </Link>
        </p>
      </div>
    </main>
  );
}
