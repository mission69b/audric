'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavItem, type BadgeVariant } from './NavItem';
import { ConvoHistoryList } from './ConvoHistoryList';
import { Tooltip } from '@/components/ui/Tooltip';
import { Tag } from '@/components/ui/Tag';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/lib/icons';
import type { PanelId } from '@/hooks/usePanel';
import { GlobalUsernameSearch } from '@/components/identity/GlobalUsernameSearch';
import { decodeJwtClaim } from '@/lib/jwt-client';

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

  // [S.84 polish v5] Counter that bumps when the user clicks the
  // collapsed sidebar's Search icon. Passed to <GlobalUsernameSearch>
  // (which only mounts in the expanded branch) — its change-effect
  // focuses the input so the user lands directly in the search field
  // after the expand animation. Number, not boolean, so a second
  // collapsed-Search click still focuses (boolean would no-op when
  // already true).
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
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

  const email = emailProp ?? decodeJwtClaim(jwt, 'email');
  // [S.84 polish] Initial sources from the handle when claimed (`A` for
  // `alice`), otherwise falls back to the email-local-part / address.
  // The avatar is now identity-coloured at-a-glance.
  const initial = useMemo(
    () =>
      username
        ? username[0].toUpperCase()
        : email
          ? email[0].toUpperCase()
          : address
            ? address.slice(2, 3).toUpperCase()
            : '?',
    [username, email, address],
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

  // [S.84 polish] Profile nav target — claimed users land on their own
  // public profile (`/[username]`); unclaimed users keep the legacy
  // settings target so the click affordance never goes nowhere.
  const handleProfileNav = useCallback(() => {
    if (username) {
      router.push(`/${username}`);
    } else {
      router.push('/settings');
    }
    onClose?.();
  }, [username, router, onClose]);

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

        {/* [S.84 polish v5] Search — mirrors the expanded sidebar's
            order (Search above New conversation). Click expands the
            sidebar AND auto-focuses the search input via the
            `searchFocusTrigger` bump → <GlobalUsernameSearch> effect.
            Without this entry, the global search was unreachable in
            collapsed mode (the search component only mounts in the
            expanded branch). */}
        <Tooltip label="Search" side="right">
          <button
            onClick={() => {
              setSearchFocusTrigger((t) => t + 1);
              onToggleCollapse?.();
            }}
            className={iconBtnClass}
            aria-label="Search users, .sui, or addresses"
          >
            <Icon name="search" size={16} />
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
            from Settings → Account → Appearance.

            [S.84 polish] Avatar tooltip prefers the Audric handle when
            claimed; click target routes to the user's public profile
            (was Settings). The user's "you" surface should go to the
            user's "you" page; Settings still has its own nav item. */}
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
                onClick={handleProfileNav}
                // Avatar pill is color-stable across themes (matches dark prototype's
                // `audric-app-dark/sidebar.jsx` line 78 — same green gradient + same
                // white initial in light and dark). `text-white` is pinned, NOT
                // `text-fg-inverse`, because fg-inverse flips to black in dark and
                // would be unreadable against the dark-green stop of the gradient.
                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-mono text-[11px] text-white focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                style={{ background: 'linear-gradient(135deg, var(--g500) 0%, var(--g700) 100%)' }}
                aria-label={username ? `View profile · ${username}.audric.sui` : 'Settings'}
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
          generic SuiNS / 0x → balance check via chat.
          [S.84 polish v5] `autoFocusTrigger` lets the collapsed
          sidebar's Search icon expand THIS surface and land focus
          directly in the input on the next render. */}
      <div className="px-3 pb-2.5 shrink-0">
        <GlobalUsernameSearch
          onCheckBalance={onSearchCheckBalance}
          autoFocusTrigger={searchFocusTrigger}
        />
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

      {/* Footer — single profile block.

          [S.84 polish v2] Two-line identity layout, identical row count
          pre/post claim:

            • Pre-claim:  email (primary) + truncated address (secondary, copy)
            • Post-claim: handle (primary) + email (secondary, muted)

          Why drop the address post-claim. `alice.audric.sui` IS the
          address (SuiNS alias) — showing both reads as "Alice Smith
          (Alice Smith)." The address has two better homes: the Receive
          flow (where copy-address is the primary action) and Settings
          → Passport → Wallet address row (canonical reference). The
          sidebar footer's job is identity orientation ("which Google /
          which handle?"), NOT copy-the-address.

          Why email is the secondary line post-claim (not address). The
          three Passport layers — email (zkLogin auth), handle (chosen
          identity), address (cryptographic identity) — collapse to TWO
          here because email is the dimension that's actually distinct.
          Handle and address are the same identity in two forms;
          handle and email are different identities entirely.

          Why no 🪪 emoji on the primary line. The `.audric.sui` suffix
          already screams identity in this surface; the emoji is
          decorative noise in a tight footer. Kept on the Receive page
          header, the Settings → Passport eyebrow, and public profile
          pages where it carries weight as a section emblem.

          Click target: `/[username]` profile when claimed, `/settings`
          otherwise. */}
      <div className="shrink-0 border-t border-border-subtle px-3 py-3">
        {(email || address || username) && (
          <button
            onClick={handleProfileNav}
            data-testid="sidebar-profile-block"
            title={
              username
                ? `View your profile · ${username}.audric.sui`
                : email || undefined
            }
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
              {/* Primary line. */}
              {username ? (
                <p className="font-mono text-[12px] text-fg-primary truncate">
                  {username}.audric.sui
                </p>
              ) : email ? (
                <p className="text-[12px] text-fg-secondary truncate">{email}</p>
              ) : null}
              {/* Secondary line. Post-claim: email (muted, view-only —
                  the sidebar isn't where you copy your email). Pre-claim:
                  truncated address (click to copy — the user has no
                  handle yet, address is their only on-chain identifier
                  and copy access matters). */}
              {username && email ? (
                <p className="text-[10px] text-fg-muted mt-0.5 truncate">
                  {email}
                </p>
              ) : !username && address ? (
                <p
                  className="font-mono text-[9px] tracking-[0.06em] uppercase text-fg-muted mt-0.5 hover:text-fg-secondary transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleCopyAddress(); }}
                  title={`Copy: ${address}`}
                >
                  {copied ? 'Copied!' : truncateAddr(address)}
                </p>
              ) : null}
            </div>
          </button>
        )}
      </div>
    </aside>
  );
}
