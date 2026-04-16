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
        group flex items-center w-full rounded-xl px-3 py-2.5 text-left transition-colors
        focus-visible:ring-2 focus-visible:ring-foreground/20 outline-none
        ${active ? 'bg-[var(--n700)] text-foreground' : 'text-muted hover:text-foreground hover:bg-[var(--n700)]'}
        ${collapsed ? 'justify-center px-0 w-10 h-10' : 'gap-3'}
      `}
      aria-current={active ? 'page' : undefined}
    >
      <span className={`w-5 h-5 shrink-0 flex items-center justify-center ${active ? 'opacity-100' : 'opacity-70'}`}>{icon}</span>
      {!collapsed && (
        <>
          <span className="font-mono text-[11px] tracking-[0.08em] uppercase flex-1 truncate">{label}</span>
          {badge === 'dot' && (
            <span className="w-[6px] h-[6px] rounded-full bg-info shrink-0" aria-label="Has updates" />
          )}
          {badge === 'soon' && (
            <span className="font-mono text-[9px] tracking-[0.06em] uppercase text-border-bright shrink-0">
              Soon
            </span>
          )}
          {typeof badge === 'number' && badge > 0 && (
            <span className="font-mono text-[10px] text-background bg-success px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0">
              {badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}
