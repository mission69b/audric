'use client';

import { useCallback } from 'react';
import { Pill } from '@/components/ui/Pill';
import { buildChipConfigs, type ChipPrefetchData } from '@/lib/chip-configs';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  onPrompt?: (prompt: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
  prefetch?: ChipPrefetchData;
  expandedChip: string | null;
  onExpandedChange: (chipId: string | null) => void;
}

export function ChipBar({
  onChipClick,
  onPrompt,
  activeFlow,
  disabled,
  prefetch,
  expandedChip,
  onExpandedChange,
}: ChipBarProps) {
  const configs = buildChipConfigs(prefetch);

  const handleChipClick = useCallback(
    (chipId: string) => {
      if (expandedChip === chipId) {
        onExpandedChange(null);
        return;
      }
      if (onPrompt) {
        onExpandedChange(chipId);
      } else {
        onChipClick(chipId);
      }
    },
    [expandedChip, onChipClick, onPrompt, onExpandedChange],
  );

  return (
    <div
      className="flex gap-1.5 flex-wrap justify-center"
      role="toolbar"
      aria-label="Quick actions"
    >
      {configs.map((chip) => {
        const isActive = activeFlow === chip.id || expandedChip === chip.id;
        return (
          <Pill
            key={chip.id}
            active={isActive}
            disabled={disabled}
            aria-expanded={expandedChip === chip.id}
            trailingChevron={onPrompt ? (isActive ? 'up' : 'down') : null}
            onClick={() => handleChipClick(chip.id)}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {chip.label.toUpperCase()}
          </Pill>
        );
      })}
    </div>
  );
}
