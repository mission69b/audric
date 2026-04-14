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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({
      top: rect.top - 8,
      left: rect.left,
    });
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
      className="w-72 rounded-lg border border-border bg-surface shadow-dropdown overflow-hidden z-[9999]"
      style={
        pos
          ? { position: 'fixed', bottom: `${window.innerHeight - pos.top}px`, left: `${pos.left}px` }
          : { position: 'absolute', bottom: '100%', left: 0, marginBottom: 8 }
      }
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

  if (pos && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}
