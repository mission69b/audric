'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';
import { BalanceDrawer } from './BalanceDrawer';

interface TopbarProps {
  address: string;
  balance: BalanceHeaderData;
  onSettingsClick: () => void;
  showHamburger?: boolean;
  onHamburgerClick?: () => void;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Topbar({
  address,
  balance,
  onSettingsClick,
  showHamburger,
  onHamburgerClick,
}: TopbarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex items-center justify-between px-4 sm:px-6 py-2 bg-background">
      {/* Left zone — hamburger on mobile only */}
      <div className="w-12 flex items-center md:invisible">
        {showHamburger && (
          <button
            onClick={onHamburgerClick}
            className="w-8 h-8 flex items-center justify-center text-muted hover:text-foreground transition rounded-md"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="5" x2="15" y2="5" />
              <line x1="3" y1="9" x2="15" y2="9" />
              <line x1="3" y1="13" x2="15" y2="13" />
            </svg>
          </button>
        )}
      </div>

      {/* Center — hero balance */}
      <div className="flex-1 text-center relative">
        {balance.loading ? (
          <div className="flex flex-col items-center gap-1">
            <Skeleton variant="block" width={120} height={32} />
          </div>
        ) : (
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="inline-block cursor-pointer"
          >
            <p className="text-4xl font-bold tracking-tight font-sans text-foreground leading-none">
              ${fmtUsd(balance.total)}
            </p>
            <p className="text-xs font-mono text-muted tracking-wide mt-0.5">
              available ${Math.floor(balance.cash)}
              {balance.savings >= 0.01 && (
                <>{' · '}earning ${Math.floor(balance.savings)}</>
              )}
              {balance.borrows > 0 && (
                <>
                  {' · '}
                  <span className="text-warning">
                    <span className="uppercase text-[10px] tracking-[0.1em]">debt</span> ${Math.floor(balance.borrows)}
                  </span>
                </>
              )}{' '}
              <span className={`inline-block transition-transform duration-200 text-dim ${drawerOpen ? 'rotate-180' : ''}`}>
                &#9662;
              </span>
            </p>
          </button>
        )}
        <BalanceDrawer balance={balance} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>

      {/* Right zone */}
      <div className="w-12 flex items-center justify-end gap-1">
        <button
          onClick={onSettingsClick}
          className="w-8 h-8 flex items-center justify-center text-muted hover:text-foreground transition rounded-md"
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
