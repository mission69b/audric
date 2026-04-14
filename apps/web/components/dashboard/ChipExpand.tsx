'use client';

import { useEffect, useRef } from 'react';
import type { ChipAction } from '@/lib/chip-configs';

interface ChipExpandProps {
  actions: ChipAction[];
  onSelect: (prompt: string) => void;
  onClose: () => void;
}

export function ChipExpand({ actions, onSelect, onClose }: ChipExpandProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-border bg-surface shadow-dropdown overflow-hidden z-50"
    >
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => {
            onSelect(action.prompt);
            onClose();
          }}
          className="w-full text-left px-3.5 py-2.5 hover:bg-[var(--n700)] transition-colors flex flex-col gap-0.5"
        >
          <span className="text-[13px] text-foreground">{action.label}</span>
          <span className="text-[11px] text-dim leading-tight">{action.sublabel}</span>
        </button>
      ))}
    </div>
  );
}
