'use client';

import { useEffect, useRef } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Icon } from '@/components/ui/Icon';
import { Tag } from '@/components/ui/Tag';
import type { ChipAction } from '@/lib/chip-configs';

interface ChipExpandProps {
  actions: ChipAction[];
  chipLabel: string;
  onSelect: (prompt: string) => void;
  onFlowSelect?: (flow: string) => void;
  onClose: () => void;
}

export function ChipExpand({ actions, chipLabel, onSelect, onFlowSelect, onClose }: ChipExpandProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  return (
    <div
      ref={ref}
      className="mt-3 rounded-lg border border-border-subtle bg-surface-sunken overflow-hidden shadow-[var(--shadow-flat)]"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface-sunken">
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          {chipLabel}
        </span>
        <Tooltip label="Close" side="top">
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:text-fg-primary transition p-1 rounded focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            aria-label="Close"
          >
            <Icon name="close" size={12} />
          </button>
        </Tooltip>
      </div>
      {actions.map((action, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            if (action.flow && onFlowSelect) {
              onFlowSelect(action.flow);
            } else {
              onSelect(action.prompt);
            }
          }}
          className="w-full text-left px-4 py-3.5 hover:bg-surface-card transition-colors border-b border-border-subtle last:border-b-0 flex items-center justify-between gap-3 group focus-visible:outline-none focus-visible:bg-surface-card"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[14px] text-fg-primary truncate">{action.label}</div>
            {action.sublabel && (
              <div className="text-[12px] text-fg-muted leading-tight mt-0.5 truncate">
                {action.sublabel}
              </div>
            )}
          </div>
          {action.flow ? (
            <Tag tone="green">INSTANT</Tag>
          ) : (
            <span className="shrink-0 text-fg-muted group-hover:text-fg-secondary transition">
              <Icon name="chevron-right" size={14} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
