import { Skeleton } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <main className="flex flex-1 flex-col items-center pt-16 px-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Balance header skeleton */}
        <div className="space-y-3">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="block" height={48} width="60%" />
          <div className="flex gap-3">
            <Skeleton variant="block" height={24} width={80} />
            <Skeleton variant="block" height={24} width={80} />
          </div>
        </div>

        {/* Feed skeleton */}
        <div className="space-y-4 pt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton variant="text" width="30%" />
              <Skeleton variant="block" height={60} width="100%" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
