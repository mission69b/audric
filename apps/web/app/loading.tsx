import { Spinner } from '@/components/ui/Spinner';

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-page">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          Loading your finances…
        </p>
      </div>
    </main>
  );
}
