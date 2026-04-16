'use client';

import { useEffect, useRef } from 'react';
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
      className="mt-2 rounded-xl border border-border bg-surface overflow-hidden shadow-lg"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-surface">
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-muted">{chipLabel}</span>
        <button
          onClick={onClose}
          className="text-dim hover:text-foreground transition text-sm leading-none p-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => {
            if (action.flow && onFlowSelect) {
              onFlowSelect(action.flow);
            } else {
              onSelect(action.prompt);
            }
          }}
          className="w-full text-left px-4 py-3 hover:bg-[var(--n700)] transition-colors border-b border-border/50 last:border-b-0 flex items-center justify-between group"
        >
          <div>
            <span className="text-[13px] text-foreground">{action.label}</span>
            {action.sublabel && (
              <span className="text-[11px] text-dim leading-tight block mt-0.5">{action.sublabel}</span>
            )}
          </div>
          {action.flow ? (
            <span className="font-mono text-[9px] tracking-wider text-success uppercase bg-success/10 px-1.5 py-0.5 rounded group-hover:bg-success/20 transition">
              instant
            </span>
          ) : (
            <span className="text-border-bright group-hover:text-muted transition text-sm">›</span>
          )}
        </button>
      ))}
    </div>
  );
}
