'use client';

import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { BriefingCard } from '@/components/dashboard/BriefingCard';
import type { useActivityFeed } from '@/hooks/useActivityFeed';
import type { BriefingData } from '@/hooks/useOvernightBriefing';

type FeedState = ReturnType<typeof useActivityFeed>;

interface ActivityPanelProps {
  feed: FeedState;
  onAction: (flow: string) => void;
  briefing?: BriefingData | null;
  onBriefingDismiss?: () => void;
  onBriefingViewReport?: () => void;
  onBriefingCtaClick?: (type: string, amount?: number) => void;
}

export function ActivityPanel({
  feed,
  onAction,
  briefing,
  onBriefingDismiss,
  onBriefingViewReport,
  onBriefingCtaClick,
}: ActivityPanelProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-4 space-y-4">
      {briefing && onBriefingDismiss && onBriefingViewReport && onBriefingCtaClick && (
        <BriefingCard
          briefing={briefing}
          onDismiss={onBriefingDismiss}
          onViewReport={onBriefingViewReport}
          onCtaClick={onBriefingCtaClick}
        />
      )}
      <ActivityFeed feed={feed} onAction={onAction} />
    </div>
  );
}
