'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppSidebar } from './AppSidebar';
import { Topbar } from './Topbar';
import { AllowanceLowBanner } from './AllowanceLowBanner';
import { usePanel } from '@/hooks/usePanel';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';

interface AppShellProps {
  address: string;
  balance: BalanceHeaderData;
  allowancePercent?: number;
  allowanceLabel?: string;
  allowanceBalance?: number | null;
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
  allowancePercent,
  allowanceLabel,
  allowanceBalance,
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
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar (>= 768px) */}
      <div className="hidden md:flex shrink-0 relative">
        <AppSidebar
          activePanel={panel}
          onPanelChange={setPanel}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          allowancePercent={allowancePercent}
          allowanceLabel={allowanceLabel}
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
        <AllowanceLowBanner balance={allowanceBalance ?? null} />
        <Topbar
          address={address}
          balance={balance}
          showHamburger
          onHamburgerClick={() => setMobileOpen(true)}
        />
        <main id="main-content" className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
