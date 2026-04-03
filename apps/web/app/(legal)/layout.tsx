import Link from 'next/link';

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/security', label: 'Security' },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        {children}

        <footer className="mt-16 pt-8 border-t border-border text-xs text-dim font-mono flex gap-6">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </footer>
      </div>
    </main>
  );
}
