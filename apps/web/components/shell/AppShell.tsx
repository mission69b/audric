'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppSidebar } from './AppSidebar';
import { Topbar } from './Topbar';
import { usePanel, type PanelId } from '@/hooks/usePanel';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';

interface AppShellProps {
  address: string;
  balance: BalanceHeaderData;
  onSettingsClick: () => void;
  allowancePercent?: number;
  allowanceLabel?: string;
  children: React.ReactNode;
}

export function AppShell({
  address,
  balance,
  onSettingsClick,
  allowancePercent,
  allowanceLabel,
  children,
}: AppShellProps) {
  const { panel, setPanel } = usePanel();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [panel]);

  const handleSettingsClick = useCallback(() => {
    setPanel('settings');
    onSettingsClick();
  }, [setPanel, onSettingsClick]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar (>= 768px) */}
      <div className="hidden md:flex shrink-0">
        <AppSidebar
          activePanel={panel}
          onPanelChange={setPanel}
          allowancePercent={allowancePercent}
          allowanceLabel={allowanceLabel}
        />
      </div>

      {/* Tablet sidebar (768–1024) — icon-only */}
      {/* Handled by collapsed prop via media query in a future pass */}

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-[99] bg-black/60 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-[100] w-[80vw] max-w-[320px] md:hidden">
            <AppSidebar
              activePanel={panel}
              onPanelChange={setPanel}
              onClose={() => setMobileOpen(false)}
              allowancePercent={allowancePercent}
              allowanceLabel={allowanceLabel}
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
          showHamburger={true}
          onHamburgerClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
