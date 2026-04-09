import Link from 'next/link';

interface Stat {
  label: string;
  value: string;
}

interface Step {
  number: string;
  title: string;
  description: string;
}

interface ProductPageProps {
  badge: string;
  title: string;
  subtitle: string;
  stats: Stat[];
  steps: Step[];
  cta: string;
  ctaPrompt: string;
  status?: 'live' | 'coming-soon';
  children?: React.ReactNode;
}

export function ProductPage({
  badge,
  title,
  subtitle,
  stats,
  steps,
  cta,
  ctaPrompt,
  status = 'live',
  children,
}: ProductPageProps) {
  return (
    <main className="flex-1 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-muted transition-colors hover:text-foreground -ml-1 pl-1"
        >
          <span aria-hidden="true">&larr;</span>
          Back to chat
        </Link>

        <header className="mt-10 space-y-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tracking-widest text-muted uppercase">
              {badge}
            </span>
            {status === 'coming-soon' && (
              <span className="rounded-full bg-warning/20 px-2 py-0.5 font-mono text-[10px] tracking-wider text-warning uppercase">
                Coming soon
              </span>
            )}
          </div>
          <h1 className="text-3xl tracking-tight text-foreground sm:text-4xl md:text-5xl">{title}</h1>
          <p className="text-base text-muted sm:text-lg">{subtitle}</p>
        </header>

        {stats.length > 0 && (
          <div className="mt-12 grid grid-cols-3 gap-3 sm:gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border p-3 sm:p-4 shadow-[var(--shadow-card)] min-w-0"
              >
                <p className="text-xl font-medium text-foreground sm:text-2xl break-words">{stat.value}</p>
                <p className="mt-1 font-mono text-[10px] tracking-wider text-muted uppercase sm:text-[11px]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {children}

        <section className="mt-16">
          <h2 className="text-2xl text-foreground">How it works</h2>
          <div className="mt-8 space-y-6">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted">
                  {step.number}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm text-muted">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-16">
          <Link
            href={`/?prompt=${encodeURIComponent(ctaPrompt)}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground min-h-[44px] px-6 py-3 font-mono text-xs tracking-wider text-background uppercase transition-opacity hover:opacity-80"
          >
            {cta}
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        <footer className="mt-24 border-t border-border pt-6 text-xs text-dim space-y-3">
          <p>
            Built with{' '}
            <span className="font-mono tracking-wider uppercase">t2000</span>{' '}
            infrastructure. Non-custodial. You approve every transaction.
          </p>
          <div className="flex gap-6 font-mono">
            <Link href="/terms" className="hover:text-muted transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-muted transition-colors">Privacy</Link>
            <Link href="/disclaimer" className="hover:text-muted transition-colors">Disclaimer</Link>
            <Link href="/security" className="hover:text-muted transition-colors">Security</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
