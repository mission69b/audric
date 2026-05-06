'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppSidebar } from './AppSidebar';
import { Tooltip } from '@/components/ui/Tooltip';
import { usePanel } from '@/hooks/usePanel';

// [PHASE 2] Topbar deleted. The hero balance previously rendered in the
// topbar moves to the dashboard's idle state in Phase 4 (BalanceHero).
// Mobile-only hamburger absolute top-left opens the overlay sidebar.
// (Top-right SettingsCog removed — Settings is reachable via the sidebar
// nav item and the avatar button.)
interface AppShellProps {
  address: string;
  jwt?: string;
  /**
   * [S.84] Bare Audric handle (e.g. `'alice'`), or `null` when the user
   * hasn't claimed yet. Forwarded to AppSidebar so the footer can
   * surface the handle as a tap-to-profile chip — Passport identity
   * gets first-class billing in the navigation chrome, not just on the
   * settings page.
   */
  username?: string | null;
  activeSessionId?: string;
  onLoadSession?: (sessionId: string) => void;
  onNewConversation?: () => void;
  /**
   * [SPEC 10 D.2] Forwarded to AppSidebar's GlobalUsernameSearch. Fired
   * when the user picks a non-Audric search result (generic SuiNS or
   * 0x). Parent (DashboardContent) switches to chat panel and dispatches
   * a balance-check prompt to the engine. `kind` tag is used to compose
   * a kind-specific prompt that prevents the agent from expanding
   * generic SuiNS into Audric handles (S.83 narration hotfix).
   */
  onSearchCheckBalance?: (
    address: string,
    label: string,
    kind: 'suins' | 'address',
  ) => void;
  children: React.ReactNode;
}

const LS_SIDEBAR_KEY = 'audric_sidebar_collapsed';

export function AppShell({
  address,
  jwt,
  username,
  activeSessionId,
  onLoadSession,
  onNewConversation,
  onSearchCheckBalance,
  children,
}: AppShellProps) {
  const { panel, setPanel } = usePanel();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LS_SIDEBAR_KEY) === '1';
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [panel]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_SIDEBAR_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-page">
      {/* Desktop sidebar (>= 768px) */}
      <div className="hidden md:flex shrink-0 relative">
        <AppSidebar
          activePanel={panel}
          onPanelChange={setPanel}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          address={address}
          jwt={jwt}
          username={username}
          activeSessionId={activeSessionId}
          onLoadSession={onLoadSession}
          onNewConversation={onNewConversation}
          onSearchCheckBalance={onSearchCheckBalance}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-[99] bg-fg-primary/40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer wrapper uses h-dvh (dynamic viewport height) instead of
              inset-y-0 because iOS Safari's address bar shrinks/grows the
              visual viewport — `inset-y-0` left a stripe of dimmer visible
              between the drawer and the bottom URL bar. h-dvh + top-0 tracks
              the live viewport on mobile. */}
          <div className="fixed top-0 left-0 h-dvh z-[100] w-[80vw] max-w-[320px] md:hidden animate-slide-from-left">
            <AppSidebar
              activePanel={panel}
              onPanelChange={setPanel}
              onClose={() => setMobileOpen(false)}
              address={address}
              jwt={jwt}
              username={username}
              activeSessionId={activeSessionId}
              onLoadSession={onLoadSession}
              onNewConversation={onNewConversation}
              onSearchCheckBalance={onSearchCheckBalance}
            />
          </div>
        </>
      )}

      {/* Main content */}
      <main
        id="main-content"
        className="flex-1 overflow-hidden flex flex-col min-w-0"
      >
        {/* Mobile-only top strip — keeps the hamburger from overlapping
            panel headings (it used to be absolute-positioned). */}
        <div className="md:hidden flex items-center px-4 py-3 border-b border-border-subtle bg-surface-page shrink-0">
          <Tooltip label="Menu" side="right">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="inline-flex items-center justify-center w-8 h-8 rounded-sm border border-border-strong bg-surface-card text-fg-muted focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="3" y1="5" x2="15" y2="5" />
                <line x1="3" y1="9" x2="15" y2="9" />
                <line x1="3" y1="13" x2="15" y2="13" />
              </svg>
            </button>
          </Tooltip>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
