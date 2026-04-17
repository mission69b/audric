'use client';

import { InputBar } from './InputBar';
import { ChipBar } from './ChipBar';
import { ChipExpand } from './ChipExpand';
import { BriefingCard } from './BriefingCard';
import { ProactiveBanner } from './ProactiveBanner';
import { HandledForYou } from './HandledForYou';
import { CopilotSuggestionsRow } from './CopilotSuggestionsRow';
import { useChipExpand } from '@/hooks/useChipExpand';
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
  // Copilot suggestions (Wave B). Mounted here so users see pending
  // confirmations even on a fresh dashboard with no chat history.
  copilotAddress?: string | null;
  copilotJwt?: string | null;
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
  copilotAddress,
  copilotJwt,
}: NewConversationViewProps) {
  const chipExpand = useChipExpand();
  const stats: string[] = [];
  if (netWorth > 0) stats.push(fmtCompact(netWorth));
  if (dailyYield > 0) stats.push(`earning ${fmtCompact(dailyYield)}/day`);
  if (savingsRate > 0) stats.push(`${(savingsRate * 100).toFixed(1)}% APY`);
  if (automationCount > 0) stats.push(`${automationCount} automation${automationCount > 1 ? 's' : ''} running`);

  return (
    <div className="flex-1 flex flex-col items-center overflow-y-auto px-4 sm:px-6">
      {/* Spacer — pushes content to center when it fits, collapses when it overflows */}
      <div className="flex-1 min-h-8" />

      {/* Copilot suggestions — render at the top so users immediately see
          pending confirmations on dashboard load. The component returns null
          when there are no suggestions, so it's invisible by default. */}
      {copilotAddress !== undefined && copilotJwt !== undefined && (
        <div className="w-full max-w-2xl mb-4">
          <CopilotSuggestionsRow address={copilotAddress ?? null} jwt={copilotJwt ?? null} />
        </div>
      )}

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

      <div className="text-center mb-5">
        <p className="text-[26px] font-light tracking-[-0.01em] font-sans text-foreground mb-2">{greeting}</p>
        {stats.length > 0 && (
          <p className="text-[13px] text-muted leading-relaxed">
            {stats.join(' · ')}
          </p>
        )}
      </div>

      <div className="w-full max-w-2xl mb-6">
        <InputBar
          onSubmit={onSend}
          placeholder="Ask anything..."
        />
      </div>

      <div ref={chipExpand.containerRef} className="w-full max-w-2xl">
        <div className="overflow-x-auto scrollbar-none flex justify-center">
          <ChipBar
            onChipClick={onChipClick}
            onPrompt={onSend}
            activeFlow={activeFlow}
            expandedChip={chipExpand.expandedChip}
            onExpandedChange={chipExpand.setExpandedChip}
          />
        </div>
        {chipExpand.activeConfig && (
          <ChipExpand
            actions={chipExpand.activeConfig.actions}
            chipLabel={chipExpand.activeConfig.label}
            onSelect={(prompt) => {
              chipExpand.close();
              onSend(prompt);
            }}
            onFlowSelect={(flow) => {
              chipExpand.close();
              onChipClick(flow);
            }}
            onClose={chipExpand.close}
          />
        )}
      </div>

      {/* Spacer — matches top spacer for centering */}
      <div className="flex-1 min-h-8" />
    </div>
  );
}
