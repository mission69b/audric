// [PHASE 10] Settings route-level loading skeleton — mirrors the new
// shell from `app/settings/page.tsx` (header strip + 220px sub-nav +
// content area) so the route swap doesn't visibly jump.

import { Skeleton } from '@/components/ui/Skeleton';

export default function SettingsLoading() {
  return (
    <main className="flex flex-col h-screen overflow-hidden bg-surface-page">
      <header className="flex items-center justify-between px-6 sm:px-8 py-[18px] border-b border-border-subtle">
        <Skeleton variant="text" width={120} />
        <Skeleton variant="text" width={70} />
      </header>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[220px_1fr] overflow-hidden">
        <aside className="md:border-r border-border-subtle px-3.5 py-5 flex md:flex-col flex-row gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="block" height={36} width="100%" />
          ))}
        </aside>
        <section className="overflow-y-auto px-6 sm:px-10 py-7">
          <div className="max-w-[640px] mx-auto space-y-4">
            <Skeleton variant="block" height={20} width="100%" />
            <Skeleton variant="block" height={120} width="100%" />
            <Skeleton variant="block" height={80} width="100%" />
            <Skeleton variant="block" height={80} width="100%" />
          </div>
        </section>
      </div>
    </main>
  );
}
