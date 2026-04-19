'use client';

import { InputBar } from './InputBar';
import { ChipBar } from './ChipBar';
import { ChipExpand } from './ChipExpand';
import { SaveDrawer } from './SaveDrawer';
import { BalanceHero } from '@/components/ui/BalanceHero';
import { useChipExpand } from '@/hooks/useChipExpand';

// [PHASE 4] Idle/empty state for the dashboard surface.
//
// Layout matches the design's centered composer pattern:
//   ┌───────────────────────────────────┐
//   │           BalanceHero             │  ← top of panel
//   │                                   │
//   │      Good afternoon, name         │  ← greeting (centered)
//   │      EARNING $X/DAY · X.X% APY    │
//   │                                   │
//   │  ┌─────────────────────────────┐  │
//   │  │  composer (InputBar)        │  │  ← centered block
//   │  └─────────────────────────────┘  │
//   │   SAVE  SEND  SWAP  CREDIT  …     │  ← chip pill row
//   │   ┌─────────────────────────────┐ │
//   │   │ SaveDrawer / ChipExpand     │ │  ← inline drawer below chips
//   │   └─────────────────────────────┘ │
//   └───────────────────────────────────┘
//
// Props extended with `available` + `earning` (feed the BalanceHero) and
// `prefetch` (forwarded to ChipBar / useChipExpand so SAVE actions render
// the right "Save all $X USDC" copy). The previous `netWorth /
// dailyYield / savingsRate` props are still consumed for the sub-eyebrow
// stats line below the greeting.
interface NewConversationViewProps {
  greeting: string;
  netWorth: number;
  dailyYield: number;
  savingsRate: number;
  available: number;
  earning: number;
  onSend: (prompt: string) => void;
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  prefetch?: { idleUsdc: number; currentApy: number };
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
  available,
  earning,
  onSend,
  onChipClick,
  activeFlow,
  prefetch,
}: NewConversationViewProps) {
  const chipExpand = useChipExpand(prefetch);

  const subStats: string[] = [];
  if (dailyYield > 0) subStats.push(`earning ${fmtCompact(dailyYield)}/day`);
  if (savingsRate > 0) subStats.push(`${(savingsRate * 100).toFixed(1)}% APY`);

  return (
    <div className="flex-1 flex flex-col items-center overflow-y-auto px-4 sm:px-6 pt-12 pb-8">
      {/* BalanceHero — top of panel, centered. */}
      <div className="w-full mb-12">
        <BalanceHero total={netWorth} available={available} earning={earning} size="lg" />
      </div>

      {/* Spacer pushes the centered block toward the visual middle when
          the panel is tall enough. */}
      <div className="flex-1 min-h-4" />

      {/* Centered composer block. */}
      <div className="w-full max-w-[700px] flex flex-col items-stretch">
        {/* Greeting + sub-eyebrow above the composer. */}
        <div className="text-center mb-7">
          <p className="text-[22px] font-medium tracking-[-0.005em] font-sans text-fg-primary mb-1.5">
            {greeting}
          </p>
          {subStats.length > 0 && (
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
              {subStats.join(' \u00B7 ')}
            </p>
          )}
        </div>

        <InputBar onSubmit={onSend} placeholder="Ask anything..." />

        <div ref={chipExpand.containerRef} className="mt-5">
          <ChipBar
            onChipClick={onChipClick}
            onPrompt={onSend}
            activeFlow={activeFlow}
            prefetch={prefetch}
            expandedChip={chipExpand.expandedChip}
            onExpandedChange={chipExpand.setExpandedChip}
          />
          {chipExpand.activeConfig && chipExpand.expandedChip === 'save' && (
            <SaveDrawer
              prefetch={prefetch}
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
          {chipExpand.activeConfig && chipExpand.expandedChip !== 'save' && (
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
      </div>

      <div className="flex-1 min-h-4" />
    </div>
  );
}
