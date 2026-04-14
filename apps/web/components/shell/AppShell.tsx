'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppSidebar } from './AppSidebar';
import { Topbar } from './Topbar';
import { usePanel } from '@/hooks/usePanel';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';

interface AppShellProps {
  address: string;
  balance: BalanceHeaderData;
  onSettingsClick: () => void;
  allowancePercent?: number;
  allowanceLabel?: string;
  jwt?: string;
  activeSessionId?: string;
  onLoadSession?: (sessionId: string) => void;
  onNewConversation?: () => void;
  children: React.ReactNode;
}

const LS_SIDEBAR_KEY = 'audric_sidebar_collapsed';

export function AppShell({
  address,
  balance,
  onSettingsClick,
  allowancePercent,
  allowanceLabel,
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

  const handleSettingsClick = useCallback(() => {
    window.location.href = '/settings';
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar (>= 768px) */}
      <div className="hidden md:flex shrink-0 relative">
        <AppSidebar
          activePanel={panel}
          onPanelChange={setPanel}
          collapsed={collapsed}
          allowancePercent={allowancePercent}
          allowanceLabel={allowanceLabel}
          address={address}
          jwt={jwt}
          activeSessionId={activeSessionId}
          onLoadSession={onLoadSession}
          onNewConversation={onNewConversation}
        />
        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full border border-border bg-surface flex items-center justify-center text-dim hover:text-foreground hover:bg-[var(--n700)] transition shadow-sm"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
          >
            <polyline points="7,2 3,5 7,8" />
          </svg>
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-[99] bg-black/60 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-[100] w-[80vw] max-w-[320px] md:hidden animate-slide-from-left">
            <AppSidebar
              activePanel={panel}
              onPanelChange={setPanel}
              onClose={() => setMobileOpen(false)}
              allowancePercent={allowancePercent}
              allowanceLabel={allowanceLabel}
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          address={address}
          balance={balance}
          onSettingsClick={handleSettingsClick}
          showHamburger
          onHamburgerClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
