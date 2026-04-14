'use client';

import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ChipAction } from '@/lib/chip-configs';

interface ChipExpandProps {
  actions: ChipAction[];
  onSelect: (prompt: string) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function ChipExpand({ actions, onSelect, onClose, anchorRef }: ChipExpandProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const top = rect.bottom + 8;
    const maxH = window.innerHeight - top - 16;
    setPos({ top, left: rect.left, maxH: Math.max(maxH, 120) });
  }, [anchorRef]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    document.addEventListener('keydown', handleEscape);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const content = (
    <div
      ref={ref}
      className="w-72 rounded-xl border border-border bg-surface shadow-dropdown z-[9999] overflow-y-auto overscroll-contain"
      style={
        pos
          ? { position: 'fixed', top: `${pos.top}px`, left: `${pos.left}px`, maxHeight: `${pos.maxH}px` }
          : { position: 'absolute', top: '100%', left: 0, marginTop: 8, maxHeight: '60vh' }
      }
    >
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => {
            onSelect(action.prompt);
            onClose();
          }}
          className="w-full text-left px-4 py-3 hover:bg-[var(--n700)] transition-colors border-b border-border/50 last:border-b-0"
        >
          <span className="text-[13px] text-foreground">{action.label}</span>
          {action.sublabel && (
            <span className="text-[11px] text-dim leading-tight block mt-0.5">{action.sublabel}</span>
          )}
        </button>
      ))}
    </div>
  );

  if (pos && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}
