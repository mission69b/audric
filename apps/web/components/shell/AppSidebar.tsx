'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { NavItem, type BadgeVariant } from './NavItem';
import { ConvoHistoryList } from './ConvoHistoryList';
import type { PanelId } from '@/hooks/usePanel';

interface SidebarProps {
  activePanel: PanelId;
  onPanelChange: (panel: PanelId) => void;
  collapsed?: boolean;
  onClose?: () => void;
  onToggleCollapse?: () => void;
  allowancePercent?: number;
  allowanceLabel?: string;
  address?: string;
  jwt?: string;
  email?: string | null;
  activeSessionId?: string;
  onLoadSession?: (sessionId: string) => void;
  onNewConversation?: () => void;
}

function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      <div
        role="tooltip"
        className="
          pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50
          whitespace-nowrap rounded-md bg-foreground px-2.5 py-1
          font-mono text-[10px] tracking-[0.06em] text-background
          opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100
          transition-all duration-150 origin-left
          shadow-[var(--shadow-dropdown)]
        "
      >
        {label}
      </div>
    </div>
  );
}

const SidebarToggleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);

const ChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
);

const PortfolioIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
);

const ActivityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
);

const PayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
);

const AutoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4" /></svg>
);

const GoalsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
);

const ReportsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
);

const ContactsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
);

const StoreIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /></svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
);

interface NavEntry {
  id: PanelId;
  label: string;
  icon: React.ReactNode;
  badge?: BadgeVariant;
}

const NAV_ITEMS: NavEntry[] = [
  { id: 'chat', label: 'Dashboard', icon: <ChatIcon /> },
  { id: 'portfolio', label: 'Portfolio', icon: <PortfolioIcon /> },
  { id: 'activity', label: 'Activity', icon: <ActivityIcon />, badge: 'dot' },
  { id: 'pay', label: 'Pay', icon: <PayIcon /> },
  { id: 'automations', label: 'Automations', icon: <AutoIcon /> },
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
  onToggleCollapse,
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

  const handleNewConvo = useCallback(() => {
    onNewConversation?.();
    handleNav('chat');
  }, [onNewConversation, handleNav]);

  const iconBtnClass = 'w-10 h-10 flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-[var(--n700)] transition focus-visible:ring-2 focus-visible:ring-foreground/20 outline-none';

  /* ─── COLLAPSED ─── */
  if (collapsed) {
    return (
      <aside
        className="flex flex-col items-center h-full bg-background border-r border-border w-[var(--sidebar-icon-width)] py-3 gap-1"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Open sidebar */}
        <Tooltip label="Open sidebar">
          <button onClick={onToggleCollapse} className={iconBtnClass} aria-label="Open sidebar">
            <SidebarToggleIcon />
          </button>
        </Tooltip>

        {/* New conversation */}
        <Tooltip label="New conversation">
          <button onClick={handleNewConvo} className={iconBtnClass} aria-label="New conversation">
            <PlusIcon />
          </button>
        </Tooltip>

        {/* Nav icons */}
        <div className="flex flex-col items-center gap-0.5 mt-2 flex-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <Tooltip key={item.id} label={item.label}>
              <NavItem
                icon={item.icon}
                label={item.label}
                active={activePanel === item.id}
                badge={item.badge}
                collapsed
                onClick={() => handleNav(item.id)}
              />
            </Tooltip>
          ))}
        </div>
      </aside>
    );
  }

  /* ─── EXPANDED ─── */
  return (
    <aside
      className="flex flex-col h-full bg-background border-r border-border w-[var(--sidebar-width)] transition-[width] duration-200"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Header — branding + close toggle */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-sans text-[15px] font-semibold tracking-tight text-foreground">Audric</span>
          <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-muted bg-[var(--n700)] px-1.5 py-0.5 rounded-sm leading-none">
            beta
          </span>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-dim hover:text-foreground hover:bg-[var(--n700)] transition focus-visible:ring-2 focus-visible:ring-foreground/20 outline-none"
            aria-label="Close sidebar"
          >
            <SidebarToggleIcon />
          </button>
        )}
      </div>

      {/* New conversation */}
      <div className="px-3 shrink-0">
        <button
          onClick={handleNewConvo}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-muted hover:text-foreground hover:bg-[var(--n700)] transition focus-visible:ring-2 focus-visible:ring-foreground/20 outline-none"
        >
          <PlusIcon />
          <span>New conversation</span>
        </button>
      </div>

      {/* Navigation — single flat list, no dividers */}
      <nav className="flex-1 overflow-y-auto px-2 pt-2">
        <div className="space-y-px">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activePanel === item.id}
              badge={item.badge}
              collapsed={false}
              onClick={() => handleNav(item.id)}
            />
          ))}
        </div>

        {/* Recents */}
        {onLoadSession && (
          <div className="mt-4">
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-dim px-2 pb-1">Recents</p>
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
              collapsed={false}
            />
          </div>
        )}
      </nav>

      {/* Footer — user info + allowance */}
      <div className="shrink-0 border-t border-border px-3 py-3 space-y-2">
        {(email || address) && (
          <button
            onClick={() => handleNav('settings')}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--n700)] transition group focus-visible:ring-2 focus-visible:ring-foreground/20 outline-none"
          >
            <div
              className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center font-mono text-[10px] text-[var(--n300)]"
              style={{ background: 'linear-gradient(135deg, var(--n700) 50%, var(--n600) 50%)' }}
            >
              {initial}
            </div>
            <div className="flex-1 min-w-0 text-left">
              {email && (
                <p className="text-[12px] text-muted truncate">{email}</p>
              )}
              {address && (
                <p
                  className="font-mono text-[10px] text-border-bright mt-px hover:text-muted transition"
                  onClick={(e) => { e.stopPropagation(); handleCopyAddress(); }}
                  title={`Copy: ${address}`}
                >
                  {copied ? 'Copied!' : truncateAddr(address)}
                </p>
              )}
            </div>
          </button>
        )}

        {allowancePercent != null && (
          <button
            onClick={() => router.push('/settings?section=features')}
            className="w-full text-left space-y-1 group focus-visible:ring-2 focus-visible:ring-foreground/20 outline-none rounded"
            title="Manage features budget"
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
    </aside>
  );
}
