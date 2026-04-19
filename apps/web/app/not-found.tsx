import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center bg-surface-page">
      <div className="space-y-5 max-w-sm">
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-fg-muted">
          404
        </p>
        <h1 className="font-serif text-[64px] leading-[1] tracking-[-0.02em] text-fg-primary">
          Not found.
        </h1>
        <p className="text-[13px] text-fg-secondary leading-relaxed">
          This page doesn&apos;t exist. Let&apos;s get you back home.
        </p>
        <Link href="/" className="contents">
          <Button variant="primary" size="lg" className="w-full">
            Back to home
          </Button>
        </Link>
      </div>
    </main>
  );
}
