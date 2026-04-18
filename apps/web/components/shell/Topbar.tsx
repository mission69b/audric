'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';
import { BalanceDrawer } from './BalanceDrawer';
// [SIMPLIFICATION DAY 11] Inline HF indicator returns — but only as a
// passive chip beneath the hero balance, not the old proactive
// "top up your debt" Copilot widget. Surfaces only when debt > 0 AND
// HF < 2.0 (per spec). The Notifications bell button was removed in
// this same pass — there is no notification UI mounted anywhere.

interface TopbarProps {
  address: string;
  balance: BalanceHeaderData;
  jwt?: string;
  showHamburger?: boolean;
  onHamburgerClick?: () => void;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Topbar({
  address,
  balance,
  jwt,
  showHamburger,
  onHamburgerClick,
}: TopbarProps) {
  void address;
  void jwt;
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Spec: HF widget is inline in the header **only** when user has debt
  // AND HF < 2.0. Passive indicator, never a notification.
  const hf = balance.healthFactor;
  const showHfWidget =
    balance.borrows > 0 &&
    hf != null &&
    hf !== Infinity &&
    hf < 2.0;
  const hfDanger = showHfWidget && hf! < 1.5;

  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
      {/* Left zone — hamburger on mobile only */}
      <div className="w-[60px] flex items-center md:invisible">
        {showHamburger && (
          <Tooltip label="Menu" side="right">
            <button
              onClick={onHamburgerClick}
              className="w-8 h-8 flex items-center justify-center text-muted hover:text-foreground transition rounded-md focus-visible:ring-2 focus-visible:ring-foreground/20 outline-none"
              aria-label="Open menu"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="3" y1="5" x2="15" y2="5" />
                <line x1="3" y1="9" x2="15" y2="9" />
                <line x1="3" y1="13" x2="15" y2="13" />
              </svg>
            </button>
          </Tooltip>
        )}
      </div>

      {/* Center — hero balance */}
      <div className="flex-1 text-center relative">
        {balance.loading ? (
          <div className="flex flex-col items-center gap-1">
            <Skeleton variant="block" width={160} height={40} />
          </div>
        ) : (
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="inline-block cursor-pointer"
          >
            <p className="text-4xl font-bold tracking-tight font-sans text-foreground leading-none">
              ${fmtUsd(balance.total)}
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] font-sans text-muted mt-1">
              <span>available ${Math.floor(balance.cash)}</span>
              {balance.savings >= 0.01 && (
                <>
                  <span className="text-border-bright">&middot;</span>
                  <span>earning ${Math.floor(balance.savings)}</span>
                </>
              )}
              {balance.borrows >= 0.01 && (
                <>
                  <span className="text-border-bright">&middot;</span>
                  <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-warning border border-warning/30 rounded-full px-1.5 py-px">
                    debt ${Math.floor(balance.borrows)} ▼
                  </span>
                </>
              )}
              {showHfWidget && (
                <>
                  <span className="text-border-bright">&middot;</span>
                  <span
                    className={[
                      'font-mono text-[10px] tracking-[0.06em] uppercase rounded-full px-1.5 py-px border',
                      hfDanger
                        ? 'text-error border-error/40'
                        : 'text-warning border-warning/30',
                    ].join(' ')}
                    title={hfDanger ? 'Health factor critically low — repay debt to avoid liquidation' : 'Health factor below safe threshold'}
                  >
                    hf {hf!.toFixed(1)}
                  </span>
                </>
              )}
            </p>
          </button>
        )}
        <BalanceDrawer balance={balance} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>

      {/* Right zone — settings icon button only (Notifications bell removed in S.11) */}
      <div className="flex items-center gap-2">
        <Tooltip label="Settings">
          <Link
            href="/settings"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface border border-border hover:border-border-bright transition focus-visible:ring-2 focus-visible:ring-foreground/20 outline-none"
            aria-label="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </Link>
        </Tooltip>
      </div>
    </div>
  );
}
