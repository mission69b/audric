'use client';

import { useCallback } from 'react';
import { NavItem, type BadgeVariant } from './NavItem';
import { ConvoHistoryList } from './ConvoHistoryList';
import type { PanelId } from '@/hooks/usePanel';

interface SidebarProps {
  activePanel: PanelId;
  onPanelChange: (panel: PanelId) => void;
  collapsed?: boolean;
  onClose?: () => void;
  allowancePercent?: number;
  allowanceLabel?: string;
  address?: string;
  jwt?: string;
  activeSessionId?: string;
  onLoadSession?: (sessionId: string) => void;
  onNewConversation?: () => void;
}

const ChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 10a1 1 0 0 1-1 1H5l-3 3V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7z" />
  </svg>
);

const PortfolioIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="3" height="8" rx="0.5" />
    <rect x="6.5" y="3" width="3" height="11" rx="0.5" />
    <rect x="11" y="1" width="3" height="13" rx="0.5" />
  </svg>
);

const ActivityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 8 4 4 7 10 10 2 13 8 15 6" />
  </svg>
);

const PayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <line x1="1" y1="7" x2="15" y2="7" />
  </svg>
);

const AutoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4v4l3 2" />
  </svg>
);

const StoreIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 2h12l-1.5 6H3.5L2 2z" />
    <circle cx="5.5" cy="13" r="1" />
    <circle cx="11.5" cy="13" r="1" />
  </svg>
);

const GoalsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5" />
    <circle cx="8" cy="8" r="3.5" />
    <circle cx="8" cy="8" r="1" />
  </svg>
);

const ReportsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="1" width="12" height="14" rx="1.5" />
    <line x1="5" y1="5" x2="11" y2="5" />
    <line x1="5" y1="8" x2="11" y2="8" />
    <line x1="5" y1="11" x2="9" y2="11" />
  </svg>
);

const ContactsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="5" r="3" />
    <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
  </svg>
);

interface NavEntry {
  id: PanelId;
  label: string;
  icon: React.ReactNode;
  badge?: BadgeVariant;
  separator?: boolean;
}

const NAV_ITEMS: NavEntry[] = [
  { id: 'chat', label: 'Dashboard', icon: <ChatIcon /> },
  { id: 'portfolio', label: 'Portfolio', icon: <PortfolioIcon /> },
  { id: 'activity', label: 'Activity', icon: <ActivityIcon />, badge: 'dot' },
  { id: 'pay', label: 'Pay', icon: <PayIcon /> },
  { id: 'automations', label: 'Automations', icon: <AutoIcon />, separator: true },
  { id: 'goals', label: 'Goals', icon: <GoalsIcon /> },
  { id: 'reports', label: 'Reports', icon: <ReportsIcon /> },
  { id: 'contacts', label: 'Contacts', icon: <ContactsIcon /> },
  { id: 'store', label: 'Store', icon: <StoreIcon />, badge: 'soon' },
];

export function AppSidebar({
  activePanel,
  onPanelChange,
  collapsed = false,
  onClose,
  allowancePercent,
  allowanceLabel,
  address,
  jwt,
  activeSessionId,
  onLoadSession,
  onNewConversation,
}: SidebarProps) {
  const handleNav = useCallback(
    (id: PanelId) => {
      onPanelChange(id);
      onClose?.();
    },
    [onPanelChange, onClose],
  );

  return (
    <aside
      className={`
        flex flex-col h-full bg-background border-r border-border
        ${collapsed ? 'w-[var(--sidebar-icon-width)]' : 'w-[var(--sidebar-width)]'}
        transition-[width] duration-200
      `}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className={`flex items-center gap-1.5 px-3 py-4 ${collapsed ? 'justify-center' : ''}`}>
        {!collapsed && (
          <>
            <span className="font-mono text-base font-bold tracking-wide text-foreground uppercase">Audric</span>
            <span className="text-[9px] uppercase tracking-widest font-medium text-muted border border-border rounded px-1.5 py-0.5 leading-none">
              beta
            </span>
          </>
        )}
        {collapsed && (
          <span className="font-mono text-base font-bold text-foreground uppercase">A</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <div key={item.id}>
            {item.separator && <div className="h-px bg-border my-2 mx-1" />}
            <NavItem
              icon={item.icon}
              label={item.label}
              active={activePanel === item.id}
              badge={item.badge}
              collapsed={collapsed}
              onClick={() => handleNav(item.id)}
            />
          </div>
        ))}
      </nav>

      {/* Conversation history */}
      {!collapsed && onLoadSession && onNewConversation && (
        <div className="px-0 py-2 border-t border-border mt-2">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim px-4 mb-1.5">History</p>
          <ConvoHistoryList
            jwt={jwt}
            address={address}
            activeSessionId={activeSessionId}
            onLoadSession={(id) => {
              onPanelChange('chat');
              onLoadSession(id);
              onClose?.();
            }}
            onNewConversation={() => {
              onPanelChange('chat');
              onNewConversation();
              onClose?.();
            }}
            collapsed={collapsed}
          />
        </div>
      )}

      {/* Allowance bar (sidebar footer) */}
      {!collapsed && allowancePercent != null && (
        <div className="px-3 pb-3 space-y-1">
          <div className="flex justify-between">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim">Allowance</span>
            {allowanceLabel && (
              <span className="font-mono text-[9px] text-muted">{allowanceLabel}</span>
            )}
          </div>
          <div className="h-[2px] w-full bg-[var(--n700)] rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full transition-[width] duration-300"
              style={{ width: `${Math.min(allowancePercent, 100)}%` }}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
