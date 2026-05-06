'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavItem, type BadgeVariant } from './NavItem';
import { ConvoHistoryList } from './ConvoHistoryList';
import { Tooltip } from '@/components/ui/Tooltip';
import { Tag } from '@/components/ui/Tag';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/lib/icons';
import type { PanelId } from '@/hooks/usePanel';
import { GlobalUsernameSearch } from '@/components/identity/GlobalUsernameSearch';

interface SidebarProps {
  activePanel: PanelId;
  onPanelChange: (panel: PanelId) => void;
  collapsed?: boolean;
  onClose?: () => void;
  onToggleCollapse?: () => void;
  address?: string;
  jwt?: string;
  email?: string | null;
  /**
   * [S.84] Bare Audric handle (e.g. `'alice'`), or `null` when the
   * user hasn't claimed yet. When present, the footer renders the
   * full `username.audric.sui` form as the primary identity row
   * (clicks → `/[username]` profile). When absent, the footer falls
   * back to the email + address chip exactly as before. This is
   * Passport's identity layer surfaced in the chrome.
   */
  username?: string | null;
  activeSessionId?: string;
  onLoadSession?: (sessionId: string) => void;
  onNewConversation?: () => void;
  /**
   * [SPEC 10 D.2] Triggered when the user picks a non-Audric search
   * result (generic SuiNS or 0x). Parent should switch to chat panel
   * and dispatch a balance-check prompt to the engine. The `kind` tag
   * lets the prompt template disambiguate generic SuiNS from raw 0x
   * (S.83 hotfix — without it, the agent silently expanded
   * `funkii.sui` into `funkii.audric.sui`).
   */
  onSearchCheckBalance?: (
    address: string,
    label: string,
    kind: 'suins' | 'address',
  ) => void;
}

interface NavEntry {
  id: PanelId;
  label: string;
  icon: IconName;
  badge?: BadgeVariant;
}

// [SIMPLIFICATION DAY 11] Dropped Automations + Reports nav entries — both
// panels were deleted in S.5/S.6 and the chat-first dashboard owns those
// surfaces now (goals + recurring deposits live behind goal/contact CRUD,
// reports are answered live in chat by `report` / `transaction_history`).
const NAV_ITEMS: NavEntry[] = [
  { id: 'chat',      label: 'Dashboard', icon: 'dashboard' },
  { id: 'portfolio', label: 'Portfolio', icon: 'portfolio' },
  { id: 'activity',  label: 'Activity',  icon: 'activity', badge: 'dot' },
  { id: 'pay',       label: 'Pay',       icon: 'pay' },
  { id: 'goals',     label: 'Goals',     icon: 'goals' },
  { id: 'contacts',  label: 'Contacts',  icon: 'contacts' },
  { id: 'store',     label: 'Store',     icon: 'store',    badge: 'soon' },
  { id: 'settings',  label: 'Settings',  icon: 'settings' },
];

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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
  address,
  jwt,
  email: emailProp,
  username,
  activeSessionId,
  onLoadSession,
  onNewConversation,
  onSearchCheckBalance,
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
  const initial = useMemo(
    () => (email ? email[0].toUpperCase() : address ? address.slice(2, 3).toUpperCase() : '?'),
    [email, address],
  );
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

  /* ─── COLLAPSED ─── */
  if (collapsed) {
    const iconBtnClass =
      'inline-flex items-center justify-center w-8 h-8 rounded-sm text-fg-muted ' +
      'hover:text-fg-primary hover:bg-surface-nav-hover transition-colors ' +
      'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]';

    return (
      <aside
        className="flex flex-col items-center h-full bg-surface-nav border-r border-border-subtle w-[var(--sidebar-icon-width)] py-3 gap-1 shrink-0"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Open sidebar */}
        <Tooltip label="Open sidebar" side="right">
          <button onClick={onToggleCollapse} className={iconBtnClass} aria-label="Open sidebar">
            <Icon name="panel-left" size={16} />
          </button>
        </Tooltip>

        {/* New conversation */}
        <Tooltip label="New conversation" side="right">
          <button onClick={handleNewConvo} className={iconBtnClass} aria-label="New conversation">
            <Icon name="plus" size={16} />
          </button>
        </Tooltip>

        {/* Nav icons */}
        <div className="flex flex-col items-center gap-0.5 mt-2 flex-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <Tooltip key={item.id} label={item.label} side="right">
              <NavItem
                icon={<Icon name={item.icon} size={16} />}
                label={item.label}
                active={activePanel === item.id}
                badge={item.badge}
                collapsed
                onClick={() => handleNav(item.id)}
              />
            </Tooltip>
          ))}
        </div>

        {/* Footer — profile only. Theme toggle removed; users switch themes
            from Settings → Account → Appearance. [S.84] Tooltip prefers
            the Audric handle when claimed (the user's primary identity). */}
        <div className="flex flex-col items-center gap-1.5 pb-3 pt-2 border-t border-border-subtle shrink-0 w-full">
          {(email || address || username) && (
            <Tooltip
              label={
                username
                  ? `${username}.audric.sui`
                  : email || (address ? truncateAddr(address) : 'Settings')
              }
              side="right"
            >
              <button
                onClick={() => handleNav('settings')}
                // Avatar pill is color-stable across themes (matches dark prototype's
                // `audric-app-dark/sidebar.jsx` line 78 — same green gradient + same
                // white initial in light and dark). `text-white` is pinned, NOT
                // `text-fg-inverse`, because fg-inverse flips to black in dark and
                // would be unreadable against the dark-green stop of the gradient.
                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-mono text-[11px] text-white focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                style={{ background: 'linear-gradient(135deg, var(--g500) 0%, var(--g700) 100%)' }}
                aria-label="Settings"
              >
                {initial}
              </button>
            </Tooltip>
          )}
        </div>
      </aside>
    );
  }

  /* ─── EXPANDED ─── */
  return (
    <aside
      className="flex flex-col h-full bg-surface-nav border-r border-border-subtle w-[var(--sidebar-width)] shrink-0"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Brand row */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-sans text-[15px] font-medium tracking-[-0.01em] text-fg-primary">
            Audric
          </span>
          <Tag tone="neutral">BETA</Tag>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-fg-muted hover:text-fg-primary hover:bg-surface-nav-hover transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            aria-label="Close sidebar"
          >
            <Icon name="panel-left" size={14} />
          </button>
        )}
      </div>

      {/* [SPEC 10 D.2] Global search — Audric users → profile,
          generic SuiNS / 0x → balance check via chat. */}
      <div className="px-3 pb-2.5 shrink-0">
        <GlobalUsernameSearch onCheckBalance={onSearchCheckBalance} />
      </div>

      {/* New conversation */}
      <div className="px-3 pb-3.5 shrink-0">
        <button
          onClick={handleNewConvo}
          className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-sm border border-border-subtle bg-transparent text-fg-secondary hover:text-fg-primary hover:border-border-strong hover:bg-surface-nav-hover transition-colors font-mono text-[10px] tracking-[0.1em] uppercase focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          <Icon name="plus" size={12} />
          <span>New conversation</span>
        </button>
      </div>

      {/* Navigation — single flat list, no dividers */}
      <nav className="flex-1 overflow-y-auto px-2">
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              icon={<Icon name={item.icon} size={14} />}
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
          <div className="mt-5 px-1">
            <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted px-2 pb-2.5">
              Recents
            </p>
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

      {/* Footer — user info. Theme toggle removed; users switch themes
          from Settings → Account → Appearance.

          [S.84] When the user has claimed an Audric handle, render a
          🪪 handle row at the TOP of the footer (above email/address)
          that links straight to their `/[username]` public profile. The
          handle is the user's primary identity — surface it FIRST. The
          email + truncated address still render below it as the
          recovery / receiving identifiers. */}
      <div className="shrink-0 border-t border-border-subtle px-3 py-3 space-y-1">
        {username && (
          <Link
            href={`/${username}`}
            data-testid="sidebar-handle-row"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-surface-nav-hover transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            title={`View your profile · ${username}.audric.sui`}
          >
            <span aria-hidden="true">🪪</span>
            <span className="font-mono text-[11px] text-fg-primary truncate">
              {username}.audric.sui
            </span>
          </Link>
        )}
        {(email || address) && (
          <button
            onClick={() => handleNav('settings')}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm hover:bg-surface-nav-hover transition-colors group focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            <div
              // See collapsed sidebar above for the rationale on `text-white`
              // (color-stable avatar pill across themes, matches dark prototype).
              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-mono text-[11px] text-white"
              style={{ background: 'linear-gradient(135deg, var(--g500) 0%, var(--g700) 100%)' }}
            >
              {initial}
            </div>
            <div className="flex-1 min-w-0 text-left">
              {email && (
                <p className="text-[12px] text-fg-secondary truncate">{email}</p>
              )}
              {address && (
                <p
                  className="font-mono text-[9px] tracking-[0.06em] uppercase text-fg-muted mt-0.5 hover:text-fg-secondary transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleCopyAddress(); }}
                  title={`Copy: ${address}`}
                >
                  {copied ? 'Copied!' : truncateAddr(address)}
                </p>
              )}
            </div>
          </button>
        )}
      </div>
    </aside>
  );
}
