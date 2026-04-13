'use client';

import { useRouter } from 'next/navigation';

const FREE_SESSION_LIMIT = 20;

interface GracePeriodBannerProps {
  sessionsUsed: number;
}

export function GracePeriodBanner({ sessionsUsed }: GracePeriodBannerProps) {
  const router = useRouter();
  const remaining = Math.max(0, FREE_SESSION_LIMIT - sessionsUsed);
  const isUrgent = remaining <= 1;

  return (
    <div className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${
      isUrgent
        ? 'border-amber-500/40 bg-amber-950/20'
        : 'border-border bg-surface'
    }`}>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${isUrgent ? 'text-amber-300' : 'text-foreground'}`}>
          {remaining > 0
            ? `${remaining} free session${remaining === 1 ? '' : 's'} remaining`
            : 'Free sessions used up'}
        </p>
        <p className="text-xs text-muted mt-0.5">
          {remaining > 0
            ? 'Set up your allowance to unlock unlimited sessions'
            : 'Top up your allowance to continue using Audric'}
        </p>
      </div>
      <button
        onClick={() => router.push('/setup')}
        className={`shrink-0 rounded-lg px-4 py-2 text-xs font-mono uppercase tracking-wider transition active:scale-[0.97] ${
          isUrgent
            ? 'bg-amber-500 text-black hover:bg-amber-400'
            : 'bg-foreground text-background hover:opacity-80'
        }`}
      >
        {remaining > 0 ? 'Set up' : 'Top up'}
      </button>
    </div>
  );
}

export { FREE_SESSION_LIMIT };
