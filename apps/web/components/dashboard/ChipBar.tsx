'use client';

import { useCallback } from 'react';
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
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none" role="toolbar" aria-label="Quick actions">
      {configs.map((chip) => (
        <button
          key={chip.id}
          onClick={() => handleChipClick(chip.id)}
          disabled={disabled}
          aria-pressed={activeFlow === chip.id || expandedChip === chip.id}
          aria-expanded={expandedChip === chip.id}
          className={[
            'shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-mono uppercase tracking-[0.08em] font-medium transition active:scale-[0.95] border flex items-center gap-1.5',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            activeFlow === chip.id || expandedChip === chip.id
              ? 'bg-[var(--n800)] border-[var(--n500)] text-foreground'
              : 'bg-transparent border-border-bright text-muted hover:text-[var(--n300)] hover:border-[var(--n500)] hover:bg-[var(--n800)]',
          ].join(' ')}
        >
          {chip.label}
          {onPrompt && (
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="currentColor"
              className={`transition-transform ${expandedChip === chip.id ? 'rotate-180' : ''}`}
            >
              <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
