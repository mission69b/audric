'use client';

import { InputBar } from './InputBar';
import { ChipBar } from './ChipBar';
import { ChipExpand } from './ChipExpand';
import { useChipExpand } from '@/hooks/useChipExpand';

// [SIMPLIFICATION DAY 5] BriefingCard / ProactiveBanner / HandledForYou /
// CopilotSuggestionsRow / useOvernightBriefing all deleted along with the
// briefing + Copilot stack. Local placeholder types preserve the optional
// prop shape so callers compiling against this view don't need a coordinated
// edit; the next dashboard pass strips the props entirely.
type BriefingData = unknown;

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

  // [SIMPLIFICATION DAY 3] Briefings, proactive banners, "Handled for you",
  // and the Copilot suggestions row have all been removed from the empty
  // state. Audric is chat-first now: greeting + stats + input + chips only.
  // The props are still accepted (and the imports retained) so the
  // component signature does not break callers; Day 6 will narrow the
  // surface area and delete the unused imports.
  void briefing;
  void proactive;
  void onDismissProactive;
  void handledActions;
  void onViewHandled;
  void copilotAddress;
  void copilotJwt;

  return (
    <div className="flex-1 flex flex-col items-center overflow-y-auto px-4 sm:px-6">
      {/* Spacer — pushes content to center when it fits, collapses when it overflows */}
      <div className="flex-1 min-h-8" />

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
