// [PHASE 12] ProductPage — re-skin shared marketing/product shell used by
// /savings, /credit, /swap, /send, /receive, and /pay (the manager).
//
// Visual updates:
//   • Mono back-link (chevron + label) at top
//   • Mono uppercase badge eyebrow
//   • Serif (NY Display) headline; sans subtitle
//   • 3-up stat cards on `surface-card` with mono eyebrow + serif value
//   • Numbered step rows with serif index inside a thin square pill
//   • Primary CTA renders as a styled <Link> (matching the Button primitive's
//     primary/lg pill visual; a private <CtaLink> helper is used because the
//     Button primitive renders <button>, and CTAs here must navigate)
//   • Footer hairline + mono utility links
//
// Behavior preservation:
//   • Identical prop surface (badge / title / subtitle / stats / steps / cta /
//     ctaPrompt / status / children).
//   • CTA href still points to `/?prompt=<encoded ctaPrompt>` — the dashboard
//     reads this query param to pre-seed the chip flow.
//   • `coming-soon` still renders the warning Tag.

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
    <main className="flex-1 px-4 py-16 sm:px-6 sm:py-24 bg-surface-page text-fg-primary">
      <div className="mx-auto max-w-[640px]">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 min-h-[44px] -ml-1 pl-1 font-mono text-[11px] tracking-[0.08em] uppercase text-fg-secondary hover:text-fg-primary transition-colors"
        >
          <span aria-hidden="true">&larr;</span>
          Back to chat
        </Link>

        <header className="mt-10 space-y-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted">
              {badge}
            </span>
            {status === 'coming-soon' && (
              <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-warning-fg bg-warning-bg border border-warning-border rounded-xs px-2 py-0.5">
                Coming soon
              </span>
            )}
          </div>
          <h1 className="font-serif text-[40px] leading-[1.05] tracking-[-0.02em] text-fg-primary sm:text-[48px] md:text-[56px]">
            {title}
          </h1>
          <p className="text-[15px] leading-relaxed text-fg-secondary sm:text-base">
            {subtitle}
          </p>
        </header>

        {stats.length > 0 && (
          <div className="mt-10 grid grid-cols-3 gap-2.5 sm:gap-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-md border border-border-subtle bg-surface-card p-3 sm:p-4 min-w-0"
              >
                <p className="font-serif text-[20px] leading-tight text-fg-primary tracking-[-0.01em] sm:text-[22px] break-words">
                  {stat.value}
                </p>
                <p className="mt-1.5 font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted sm:text-[10px]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {children}

        <section className="mt-14">
          <h2 className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted">
            How it works
          </h2>
          <div className="mt-1 mb-5 h-px bg-border-subtle" />
          <div className="space-y-5">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xs border border-border-subtle bg-surface-card font-serif text-[15px] text-fg-primary">
                  {step.number}
                </div>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-fg-primary">{step.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-fg-secondary">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-14">
          <CtaLink href={`/?prompt=${encodeURIComponent(ctaPrompt)}`} label={cta} />
        </div>

        <footer className="mt-20 border-t border-border-subtle pt-6 space-y-3 text-[11px] text-fg-muted">
          <p>
            Built with{' '}
            <span className="font-mono tracking-[0.06em] uppercase">t2000</span>{' '}
            infrastructure. Non-custodial. You approve every transaction.
          </p>
          <div className="flex gap-6 font-mono text-[10px] tracking-[0.1em] uppercase">
            <Link href="/terms" className="hover:text-fg-secondary transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-fg-secondary transition-colors">
              Privacy
            </Link>
            <Link href="/disclaimer" className="hover:text-fg-secondary transition-colors">
              Disclaimer
            </Link>
            <Link href="/security" className="hover:text-fg-secondary transition-colors">
              Security
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

// CTA renders as a real <Link> so prefetching + middle-click open work, but
// borrows the same pill visual as <Button variant="primary" size="lg">. Kept
// private to this file because no other surface needs a link-styled-as-button
// right now.
function CtaLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-pill bg-fg-primary text-fg-inverse font-mono text-[12px] tracking-[0.06em] uppercase hover:opacity-90 active:opacity-80 transition-opacity focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
    >
      <span>{label}</span>
      <span aria-hidden="true">&rarr;</span>
    </Link>
  );
}
