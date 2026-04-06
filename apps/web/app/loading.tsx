import { AudricMark } from '@/components/ui/AudricMark';

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <AudricMark size={32} animate />
        <p className="text-sm text-muted animate-pulse">Loading your finances...</p>
      </div>
    </main>
  );
}
