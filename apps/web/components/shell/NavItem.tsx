'use client';

import type { ReactNode } from 'react';

export type BadgeVariant = null | 'dot' | 'soon' | number;

interface NavItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  badge?: BadgeVariant;
  collapsed?: boolean;
  onClick?: () => void;
}

export function NavItem({ icon, label, active, badge, collapsed, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'group flex items-center w-full rounded-sm text-left transition-colors',
        'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
        active
          ? 'bg-border-subtle text-fg-primary'
          : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-card',
        collapsed
          ? 'justify-center w-10 h-10 px-0'
          : 'gap-2.5 px-2.5 py-2',
      ].join(' ')}
      aria-current={active ? 'page' : undefined}
    >
      <span
        className={[
          'shrink-0 inline-flex items-center justify-center',
          collapsed ? 'w-4 h-4' : 'w-3.5 h-3.5',
          active ? 'opacity-100' : 'opacity-90',
        ].join(' ')}
      >
        {icon}
      </span>
      {!collapsed && (
        <>
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase flex-1 truncate">
            {label}
          </span>
          {badge === 'dot' && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-accent-primary shrink-0"
              aria-label="Has updates"
            />
          )}
          {badge === 'soon' && (
            <span className="font-mono text-[8px] tracking-[0.1em] uppercase text-fg-muted shrink-0">
              Soon
            </span>
          )}
          {typeof badge === 'number' && badge > 0 && (
            <span className="font-mono text-[9px] tracking-[0.06em] uppercase text-fg-inverse bg-success-solid px-1.5 py-px rounded-pill min-w-[18px] text-center shrink-0">
              {badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}
