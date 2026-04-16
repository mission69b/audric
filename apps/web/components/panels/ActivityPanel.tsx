'use client';

import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import type { useActivityFeed } from '@/hooks/useActivityFeed';

type FeedState = ReturnType<typeof useActivityFeed>;

interface ActivityPanelProps {
  feed: FeedState;
  onAction: (flow: string) => void;
}

export function ActivityPanel({
  feed,
  onAction,
}: ActivityPanelProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-4 space-y-4">
      <ActivityFeed feed={feed} onAction={onAction} />
    </div>
  );
}
