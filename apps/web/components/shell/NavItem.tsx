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
      className={`
        group flex items-center gap-2 w-full rounded-md px-2 py-2 text-left transition-colors
        ${active ? 'bg-[var(--n700)] text-foreground' : 'text-dim hover:text-muted hover:bg-[var(--n700)]'}
        ${collapsed ? 'justify-center px-0' : ''}
      `}
      title={collapsed ? label : undefined}
    >
      <span className={`w-4 h-4 shrink-0 flex items-center justify-center ${active ? 'opacity-100' : 'opacity-60'}`}>{icon}</span>
      {!collapsed && (
        <>
          <span className="font-mono text-[10px] tracking-[0.08em] uppercase flex-1 truncate">
            {label}{active && <span className="text-[6px] ml-1 align-middle">■</span>}
          </span>
          {badge === 'dot' && (
            <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
          )}
          {badge === 'soon' && (
            <span className="font-mono text-[8px] tracking-[0.1em] uppercase text-dim bg-[var(--n700)] px-1.5 py-0.5 rounded-full shrink-0">
              Soon
            </span>
          )}
          {typeof badge === 'number' && badge > 0 && (
            <span className="font-mono text-[9px] text-background bg-success px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0">
              {badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}
