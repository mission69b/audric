'use client';

import { useState, useCallback, useRef } from 'react';
import { ChipExpand } from './ChipExpand';
import { buildChipConfigs, type ChipPrefetchData } from '@/lib/chip-configs';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  onPrompt?: (prompt: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
  prefetch?: ChipPrefetchData;
}

export function ChipBar({ onChipClick, onPrompt, activeFlow, disabled, prefetch }: ChipBarProps) {
  const [expandedChip, setExpandedChip] = useState<string | null>(null);
  const configs = buildChipConfigs(prefetch);
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleChipClick = useCallback(
    (chipId: string) => {
      if (expandedChip === chipId) {
        setExpandedChip(null);
        return;
      }
      if (onPrompt) {
        setExpandedChip(chipId);
      } else {
        onChipClick(chipId);
      }
    },
    [expandedChip, onChipClick, onPrompt],
  );

  const handlePromptSelect = useCallback(
    (prompt: string) => {
      setExpandedChip(null);
      if (onPrompt) {
        onPrompt(prompt);
      }
    },
    [onPrompt],
  );

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none" role="toolbar" aria-label="Quick actions">
      {configs.map((chip) => (
        <div key={chip.id} className="relative shrink-0">
          <button
            ref={(el) => {
              if (el) chipRefs.current.set(chip.id, el);
              else chipRefs.current.delete(chip.id);
            }}
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
                <path d="M1 5.5L4 2.5L7 5.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            )}
          </button>
          {expandedChip === chip.id && (
            <ChipExpand
              actions={chip.actions}
              onSelect={handlePromptSelect}
              onClose={() => setExpandedChip(null)}
              anchorRef={{ current: chipRefs.current.get(chip.id) ?? null }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
