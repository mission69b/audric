'use client';

import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  label: string;
  side?: Side;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ label, side = 'bottom', children, className }: TooltipProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const show = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;

    let top = 0;
    let left = 0;

    switch (side) {
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + gap;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - gap;
        break;
      case 'top':
        top = rect.top - gap;
        left = rect.left + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2;
        break;
    }

    setCoords({ top, left });
    setVisible(true);
  }, [side]);

  const hide = useCallback(() => setVisible(false), []);

  const translate =
    side === 'right' || side === 'left' ? 'translateY(-50%)' : 'translateX(-50%)';

  return (
    <>
      <div
        ref={triggerRef}
        className={className ?? 'inline-flex'}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>
      {mounted && visible && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none whitespace-nowrap rounded-md bg-fg-primary px-2.5 py-1.5 text-[11px] text-fg-inverse leading-none shadow-lg"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: translate,
            zIndex: 9999,
          }}
        >
          {label}
        </div>,
        document.body,
      )}
    </>
  );
}
