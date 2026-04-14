'use client';

import { useEffect, useRef } from 'react';
import type { ChipAction } from '@/lib/chip-configs';

interface ChipExpandProps {
  actions: ChipAction[];
  chipLabel: string;
  onSelect: (prompt: string) => void;
  onClose: () => void;
}

export function ChipExpand({ actions, chipLabel, onSelect, onClose }: ChipExpandProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="rounded-xl border border-border bg-surface overflow-hidden max-h-[50vh] overflow-y-auto overscroll-contain shadow-lg"
    >
      <div className="sticky top-0 flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-surface z-10">
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
          onClick={() => onSelect(action.prompt)}
          className="w-full text-left px-4 py-3 hover:bg-[var(--n700)] transition-colors border-b border-border/50 last:border-b-0 flex items-center justify-between group"
        >
          <div>
            <span className="text-[13px] text-foreground">{action.label}</span>
            {action.sublabel && (
              <span className="text-[11px] text-dim leading-tight block mt-0.5">{action.sublabel}</span>
            )}
          </div>
          <span className="text-border-bright group-hover:text-muted transition text-sm">›</span>
        </button>
      ))}
    </div>
  );
}
