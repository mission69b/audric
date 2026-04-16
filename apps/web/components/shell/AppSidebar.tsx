'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  email?: string | null;
  activeSessionId?: string;
  onLoadSession?: (sessionId: string) => void;
  onNewConversation?: () => void;
}

const ChatIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
);

const PortfolioIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
);

const ActivityIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
);

const PayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
);

const AutoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4" /></svg>
);

const GoalsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
);

const ReportsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
);

const ContactsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
);

const StoreIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /></svg>
);

const SettingsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
);

interface NavEntry {
  id: PanelId;
  label: string;
  icon: React.ReactNode;
  badge?: BadgeVariant;
}

const NAV_PRIMARY: NavEntry[] = [
  { id: 'chat', label: 'Dashboard', icon: <ChatIcon /> },
  { id: 'portfolio', label: 'Portfolio', icon: <PortfolioIcon /> },
  { id: 'activity', label: 'Activity', icon: <ActivityIcon />, badge: 'dot' },
  { id: 'pay', label: 'Pay', icon: <PayIcon /> },
  { id: 'automations', label: 'Automations', icon: <AutoIcon /> },
];

const NAV_ACCOUNT: NavEntry[] = [
  { id: 'goals', label: 'Goals', icon: <GoalsIcon /> },
  { id: 'reports', label: 'Reports', icon: <ReportsIcon /> },
  { id: 'contacts', label: 'Contacts', icon: <ContactsIcon /> },
  { id: 'store', label: 'Store', icon: <StoreIcon />, badge: 'soon' },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function decodeEmail(jwt: string | undefined): string | null {
  if (!jwt) return null;
  try {
    const payload = jwt.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

export function AppSidebar({
  activePanel,
  onPanelChange,
  collapsed = false,
  onClose,
  allowancePercent,
  allowanceLabel,
  address,
  jwt,
  email: emailProp,
  activeSessionId,
  onLoadSession,
  onNewConversation,
}: SidebarProps) {
  const router = useRouter();
  const handleNav = useCallback(
    (id: PanelId) => {
      if (id === 'settings') {
        router.push('/settings');
        onClose?.();
        return;
      }
      onPanelChange(id);
      onClose?.();
    },
    [onPanelChange, onClose, router],
  );

  const email = emailProp ?? decodeEmail(jwt);
  const initial = useMemo(() => (email ? email[0].toUpperCase() : address ? address.slice(2, 3).toUpperCase() : '?'), [email, address]);
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* fallback: ignore */ }
  }, [address]);

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
      <div className={`flex items-center gap-2 px-4 py-3 border-b border-border shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        {!collapsed && (
          <>
            <span className="font-mono text-[13px] tracking-[0.12em] text-foreground uppercase">Audric</span>
            <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-muted bg-[var(--n700)] px-1.5 py-0.5 rounded-sm leading-none">
              beta
            </span>
          </>
        )}
        {collapsed && (
          <span className="font-mono text-[13px] text-foreground uppercase">A</span>
        )}
      </div>

      {/* Action buttons */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 py-2 shrink-0">
          <button
            onClick={() => {
              onNewConversation?.();
              handleNav('chat');
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-surface transition"
            aria-label="New conversation"
            title="New conversation"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-surface transition"
            aria-label="Search"
            title="Search"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </button>
        </div>
      ) : (
        <div className="px-3 pt-3 pb-2 flex flex-col gap-1 shrink-0">
          <button
            onClick={() => {
              onNewConversation?.();
              handleNav('chat');
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-[10px] tracking-[0.08em] uppercase text-muted border border-border hover:text-foreground hover:border-border-bright hover:bg-surface transition"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New conversation
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-[10px] tracking-[0.08em] uppercase text-muted border border-border hover:text-foreground hover:border-border-bright hover:bg-surface transition"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            Search
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        {/* Primary nav — NAVIGATE */}
        {!collapsed && (
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-dim px-4 pt-3 pb-1">Navigate</p>
        )}
        <div className="px-2 space-y-px">
          {NAV_PRIMARY.map((item) => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activePanel === item.id}
              badge={item.badge}
              collapsed={collapsed}
              onClick={() => handleNav(item.id)}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="h-[0.5px] bg-border my-2 mx-3" />

        {/* Secondary nav — ACCOUNT */}
        {!collapsed && (
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-dim px-4 pt-1 pb-1">Account</p>
        )}
        <div className="px-2 space-y-px">
          {NAV_ACCOUNT.map((item) => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activePanel === item.id}
              badge={item.badge}
              collapsed={collapsed}
              onClick={() => handleNav(item.id)}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="h-[0.5px] bg-border my-2 mx-3" />
      </nav>

      {/* Conversation history */}
      {!collapsed && onLoadSession && (
        <div className="shrink-0 border-t border-border">
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-dim px-4 pt-2 pb-1">Conversations</p>
          <ConvoHistoryList
            jwt={jwt}
            address={address}
            activeSessionId={activeSessionId}
            onLoadSession={(id) => {
              onPanelChange('chat');
              onLoadSession(id);
              onClose?.();
            }}
            onDeleteSession={() => {
              onNewConversation?.();
            }}
            collapsed={collapsed}
          />
        </div>
      )}

      {/* Footer — user info + allowance */}
      {!collapsed && (
        <div className="shrink-0 border-t border-border px-3 py-3 space-y-2">
          {/* User row — click goes to Settings, address copies on click */}
          {(email || address) && (
            <button
              onClick={() => handleNav('settings')}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--n700)] transition group"
            >
              <div
                className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center font-mono text-[10px] text-[var(--n300)]"
                style={{ background: 'linear-gradient(135deg, var(--n700) 50%, var(--n600) 50%)' }}
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0 text-left">
                {email && (
                  <p className="text-[11px] text-muted truncate">{email}</p>
                )}
                {address && (
                  <p
                    className="font-mono text-[9px] text-border-bright mt-px hover:text-muted transition"
                    onClick={(e) => { e.stopPropagation(); handleCopyAddress(); }}
                    title={`Copy: ${address}`}
                  >
                    {copied ? 'Copied!' : truncateAddr(address)}
                  </p>
                )}
              </div>
            </button>
          )}

          {/* Features budget bar — click to top up */}
          {allowancePercent != null && (
            <button
              onClick={() => router.push('/setup')}
              className="w-full text-left space-y-1 group"
              title="Top up features budget"
            >
              <div className="flex justify-between">
                <span className="font-mono text-[9px] tracking-[0.06em] uppercase text-border-bright group-hover:text-muted transition">Features budget</span>
                {allowanceLabel && (
                  <span className="font-mono text-[9px] text-muted">{allowanceLabel}</span>
                )}
              </div>
              <div className="h-[2px] w-full bg-border rounded-[1px] overflow-hidden">
                <div
                  className="h-full bg-success/40 rounded-[1px] transition-[width] duration-300"
                  style={{ width: `${Math.min(allowancePercent, 100)}%` }}
                />
              </div>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
