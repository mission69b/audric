'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppSidebar } from './AppSidebar';
import { SettingsCog } from '@/components/ui/SettingsCog';
import { Tooltip } from '@/components/ui/Tooltip';
import { usePanel } from '@/hooks/usePanel';

// [PHASE 2] Topbar deleted. The hero balance previously rendered in the
// topbar moves to the dashboard's idle state in Phase 4 (BalanceHero).
// SettingsCog absolute top-right replaces the gear button. Mobile-only
// hamburger absolute top-left opens the overlay sidebar.
interface AppShellProps {
  address: string;
  jwt?: string;
  activeSessionId?: string;
  onLoadSession?: (sessionId: string) => void;
  onNewConversation?: () => void;
  children: React.ReactNode;
}

const LS_SIDEBAR_KEY = 'audric_sidebar_collapsed';

export function AppShell({
  address,
  jwt,
  activeSessionId,
  onLoadSession,
  onNewConversation,
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
          activeSessionId={activeSessionId}
          onLoadSession={onLoadSession}
          onNewConversation={onNewConversation}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-[99] bg-fg-primary/40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-[100] w-[80vw] max-w-[320px] md:hidden animate-slide-from-left">
            <AppSidebar
              activePanel={panel}
              onPanelChange={setPanel}
              onClose={() => setMobileOpen(false)}
              address={address}
              jwt={jwt}
              activeSessionId={activeSessionId}
              onLoadSession={onLoadSession}
              onNewConversation={onNewConversation}
            />
          </div>
        </>
      )}

      {/* Main content */}
      <main
        id="main-content"
        className="flex-1 overflow-hidden flex flex-col relative min-w-0"
      >
        {/* Mobile-only hamburger — opens sidebar overlay */}
        <div className="md:hidden absolute top-4 left-4 z-20">
          <Tooltip label="Menu" side="right">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="inline-flex items-center justify-center w-8 h-8 rounded-sm border border-border-strong bg-surface-card text-fg-muted hover:text-fg-primary hover:border-fg-primary transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="3" y1="5" x2="15" y2="5" />
                <line x1="3" y1="9" x2="15" y2="9" />
                <line x1="3" y1="13" x2="15" y2="13" />
              </svg>
            </button>
          </Tooltip>
        </div>

        {/* Settings cog — absolute top-right, hidden on /settings */}
        <div className="absolute top-4 right-6 z-20">
          <SettingsCog />
        </div>

        {children}
      </main>
    </div>
  );
}
