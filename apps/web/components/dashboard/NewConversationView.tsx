'use client';

import { InputBar } from './InputBar';
import { ChipBar } from './ChipBar';
import { BriefingCard } from './BriefingCard';
import { ProactiveBanner } from './ProactiveBanner';
import { HandledForYou } from './HandledForYou';
import type { BriefingData } from '@/hooks/useOvernightBriefing';

interface HandledAction {
  icon: string;
  label: string;
  detail: string;
}

interface ProactiveSuggestion {
  title: string;
  description: string;
  cta: string;
  onCtaClick: () => void;
  variant?: 'default' | 'success' | 'warning';
}

interface NewConversationViewProps {
  greeting: string;
  netWorth: number;
  dailyYield: number;
  savingsRate: number;
  automationCount: number;
  onSend: (prompt: string) => void;
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  briefing?: {
    briefing: BriefingData;
    dismiss: () => void;
    onViewReport: () => void;
    onCtaClick: (type: string, amount?: number) => void;
  } | null;
  proactive?: ProactiveSuggestion | null;
  onDismissProactive?: () => void;
  handledActions?: HandledAction[];
  onViewHandled?: () => void;
}

function fmtCompact(n: number): string {
  if (n >= 1) return `$${Math.floor(n).toLocaleString()}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return '$0';
}

export function NewConversationView({
  greeting,
  netWorth,
  dailyYield,
  savingsRate,
  automationCount,
  onSend,
  onChipClick,
  activeFlow,
  briefing,
  proactive,
  onDismissProactive,
  handledActions,
  onViewHandled,
}: NewConversationViewProps) {
  const stats: string[] = [];
  if (netWorth > 0) stats.push(fmtCompact(netWorth));
  if (dailyYield > 0) stats.push(`earning ${fmtCompact(dailyYield)}/day`);
  if (savingsRate > 0) stats.push(`${(savingsRate * 100).toFixed(1)}% APY`);
  if (automationCount > 0) stats.push(`${automationCount} automation${automationCount > 1 ? 's' : ''} running`);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 -mt-8">
      {briefing && (
        <div className="w-full max-w-2xl mb-6">
          <BriefingCard
            briefing={briefing.briefing}
            onDismiss={briefing.dismiss}
            onViewReport={briefing.onViewReport}
            onCtaClick={briefing.onCtaClick}
          />
        </div>
      )}

      {handledActions && handledActions.length > 0 && onViewHandled && (
        <div className="w-full max-w-2xl mb-4">
          <HandledForYou actions={handledActions} onViewAll={onViewHandled} />
        </div>
      )}

      {proactive && onDismissProactive && (
        <div className="w-full max-w-2xl mb-4">
          <ProactiveBanner
            title={proactive.title}
            description={proactive.description}
            cta={proactive.cta}
            onCtaClick={proactive.onCtaClick}
            onDismiss={onDismissProactive}
            variant={proactive.variant}
          />
        </div>
      )}

      <p className="font-heading text-lg text-foreground mb-8">{greeting}</p>

      <div className="w-full max-w-2xl mb-6">
        <InputBar
          onSubmit={onSend}
          placeholder="Ask anything..."
        />
      </div>

      <div className="w-full max-w-2xl overflow-x-auto scrollbar-none flex justify-center">
        <ChipBar
          onChipClick={onChipClick}
          activeFlow={activeFlow}
        />
      </div>
    </div>
  );
}
