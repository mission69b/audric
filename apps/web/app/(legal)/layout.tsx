import Link from 'next/link';

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/security', label: 'Security' },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-surface-page text-fg-primary">
      <div className="max-w-2xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
        {children}

        <footer className="mt-20 pt-8 border-t border-border-subtle flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-fg-primary transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </footer>
      </div>
    </main>
  );
}
