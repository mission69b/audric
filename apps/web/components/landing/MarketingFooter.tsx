// [PHASE 13] Marketing — public-page footer (4-column).
// Replaces the old single-row footer in the landing monolith. Mirrors
// `footer.new` from `audric-marketing/index.html`.
//
// Behavior preserved: legal links route to existing /terms, /privacy,
// /disclaimer, /security pages. The "Get your Passport" CTA invokes
// `useZkLogin().login`.

'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useZkLogin } from '@/components/auth/useZkLogin';

const FOOTER_LINK_CLASS =
  'block text-[13px] text-fg-secondary py-1 hover:text-fg-primary transition-colors';

const PRODUCT_LINKS = [
  { href: '#passport', label: 'Passport' },
  { href: '#intelligence', label: 'Intelligence' },
  { href: '#finance', label: 'Finance' },
  { href: '#pay', label: 'Pay' },
  { href: '#store', label: 'Store' },
];

const RESOURCE_LINKS: { label: string; href?: string }[] = [
  { label: 'Docs', href: 'https://t2000.ai/docs' },
  { label: 'GitHub', href: 'https://github.com/mission69b/t2000' },
  { label: 'X', href: 'https://x.com/AudricAI' },
  { label: 'Discord', href: 'https://discord.gg/qE95FPt6Z5' },
];

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/security', label: 'Security' },
];

export function MarketingFooter() {
  const { login } = useZkLogin();

  return (
    <footer className="bg-surface-card border-t border-border-subtle">
      <div className="grid grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr] gap-10 lg:gap-12 px-10 pt-16 pb-10 max-w-[1200px] mx-auto">
        <div className="flex flex-col items-start col-span-2 lg:col-span-1">
          <div className="text-[17px] font-medium text-fg-primary mb-1">Audric</div>
          <div className="text-[13px] text-fg-secondary leading-snug mb-5">Your money, handled.</div>
          <button
            type="button"
            onClick={login}
            className="inline-flex items-center gap-2 border border-border-subtle px-4 py-2.5 rounded-xs font-mono text-[11px] tracking-[0.08em] uppercase text-fg-primary bg-surface-page hover:border-border-strong transition cursor-pointer"
          >
            Get your Passport →
          </button>
        </div>

        <FooterCol heading="Product">
          {PRODUCT_LINKS.map((link) => (
            <a key={link.label} href={link.href} className={FOOTER_LINK_CLASS}>
              {link.label}
            </a>
          ))}
        </FooterCol>

        <FooterCol heading="Resources">
          {RESOURCE_LINKS.map((link) =>
            link.href ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={FOOTER_LINK_CLASS}
              >
                {link.label}
              </a>
            ) : (
              <span key={link.label} className={`${FOOTER_LINK_CLASS} cursor-default text-fg-muted`}>
                {link.label}
              </span>
            ),
          )}
        </FooterCol>

        <div className="col-span-2 lg:col-span-3 border-t border-border-subtle pt-5 mt-3 flex flex-col sm:flex-row justify-between gap-3 font-mono text-[10px] tracking-[0.08em] uppercase text-fg-muted">
          <div>© 2026 Audric · Built on Sui · Non-custodial</div>
          <div className="flex gap-4 sm:gap-5 flex-wrap">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-fg-secondary transition">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted mb-3.5">
        {heading}
      </h4>
      <div>{children}</div>
    </div>
  );
}
