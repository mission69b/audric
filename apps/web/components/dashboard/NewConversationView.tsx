'use client';

import { InputBar } from './InputBar';
import { ChipBar } from './ChipBar';
import { ChipExpand } from './ChipExpand';
import { useChipExpand } from '@/hooks/useChipExpand';

// [SIMPLIFICATION DAY 11] Final chat-first empty state. Props narrowed to
// the four canonical inputs (greeting + balance summary + chat + chips).
// Earlier passes carried optional briefing/proactive/handled/copilot
// props as soft no-ops for source-compat; the dashboard call site no
// longer passes them, so they're gone for good now.
interface NewConversationViewProps {
  greeting: string;
  netWorth: number;
  dailyYield: number;
  savingsRate: number;
  onSend: (prompt: string) => void;
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
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
  onSend,
  onChipClick,
  activeFlow,
}: NewConversationViewProps) {
  const chipExpand = useChipExpand();
  const stats: string[] = [];
  if (netWorth > 0) stats.push(fmtCompact(netWorth));
  if (dailyYield > 0) stats.push(`earning ${fmtCompact(dailyYield)}/day`);
  if (savingsRate > 0) stats.push(`${(savingsRate * 100).toFixed(1)}% APY`);

  return (
    <div className="flex-1 flex flex-col items-center overflow-y-auto px-4 sm:px-6">
      {/* Spacer — pushes content to center when it fits, collapses when it overflows */}
      <div className="flex-1 min-h-8" />

      <div className="text-center mb-5">
        <p className="text-[26px] font-light tracking-[-0.01em] font-sans text-foreground mb-2">{greeting}</p>
        {stats.length > 0 && (
          <p className="text-[13px] text-muted leading-relaxed">
            {stats.join(' \u00B7 ')}
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
