import { Skeleton } from '@/components/ui/Skeleton';

export default function SettingsLoading() {
  return (
    <main className="flex flex-1 flex-col items-center pt-16 px-4">
      <div className="w-full max-w-3xl space-y-6">
        <Skeleton variant="text" width={120} />
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-6">
          {/* Nav skeleton */}
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} variant="block" height={36} width="100%" />
            ))}
          </div>
          {/* Content skeleton */}
          <div className="space-y-4">
            <Skeleton variant="block" height={120} width="100%" />
            <Skeleton variant="block" height={80} width="100%" />
            <Skeleton variant="block" height={80} width="100%" />
          </div>
        </div>
      </div>
    </main>
  );
}
