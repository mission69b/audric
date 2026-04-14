'use client';

import { useState, useEffect, useMemo } from 'react';

interface HandledAction {
  icon: string;
  label: string;
  detail: string;
}

interface ProactiveSuggestion {
  title: string;
  description: string;
  cta: string;
  variant: 'default' | 'success' | 'warning';
  action: string;
}

interface AppEvent {
  id: string;
  type: string;
  action: string;
  amount: number | null;
  asset: string | null;
  details: string | null;
  createdAt: string;
}

interface UseDashboardInsightsOptions {
  address: string | null;
  jwt: string | null;
  idleUsdc: number;
  savings: number;
  savingsRate: number;
  debt: number;
  healthFactor: number | null;
}

export function useDashboardInsights(opts: UseDashboardInsightsOptions) {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!opts.address || !opts.jwt) return;
    fetch(`/api/activity?limit=10`, {
      headers: { 'x-zklogin-jwt': opts.jwt, 'x-sui-address': opts.address },
    })
      .then((r) => r.ok ? r.json() : { events: [] })
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setEvents([]));
  }, [opts.address, opts.jwt]);

  const handledActions: HandledAction[] = useMemo(() => {
    const handled: HandledAction[] = [];
    const now = Date.now();
    const oneDayAgo = now - 86_400_000;

    for (const evt of events) {
      const evtTime = new Date(evt.createdAt).getTime();
      if (evtTime < oneDayAgo) continue;

      switch (evt.type) {
        case 'compound':
        case 'auto_compound':
          handled.push({
            icon: '🔄',
            label: 'Auto-compounded rewards',
            detail: evt.amount ? `$${evt.amount.toFixed(2)}` : '',
          });
          break;
        case 'rate_alert':
          handled.push({
            icon: '📊',
            label: 'Rate change alert sent',
            detail: evt.details ?? '',
          });
          break;
        case 'briefing':
          handled.push({
            icon: '☀️',
            label: 'Morning briefing delivered',
            detail: 'today',
          });
          break;
        case 'hf_alert':
          handled.push({
            icon: '⚠️',
            label: 'Health factor alert sent',
            detail: evt.details ?? '',
          });
          break;
        case 'schedule_execution':
          handled.push({
            icon: '⚡',
            label: `Executed ${evt.action ?? 'scheduled action'}`,
            detail: evt.amount ? `$${evt.amount.toFixed(2)} ${evt.asset ?? ''}` : '',
          });
          break;
      }
      if (handled.length >= 3) break;
    }
    return handled;
  }, [events]);

  const proactive: ProactiveSuggestion | null = useMemo(() => {
    if (dismissed) return null;

    if (opts.idleUsdc > 10 && opts.savingsRate > 0) {
      const annual = opts.idleUsdc * opts.savingsRate;
      return {
        title: `$${Math.floor(opts.idleUsdc)} idle USDC in your wallet`,
        description: `Saving it would earn ~$${annual.toFixed(1)}/year at ${(opts.savingsRate * 100).toFixed(1)}% APY.`,
        cta: 'Save idle USDC',
        variant: 'success' as const,
        action: 'Save all my idle USDC',
      };
    }

    if (opts.healthFactor != null && opts.healthFactor < 1.8 && opts.debt > 0) {
      return {
        title: 'Health factor dropping',
        description: `At ${opts.healthFactor.toFixed(1)}, you're approaching liquidation risk. Consider repaying some debt.`,
        cta: 'Repay debt',
        variant: 'warning' as const,
        action: 'Repay all my debt',
      };
    }

    return null;
  }, [opts.idleUsdc, opts.savingsRate, opts.healthFactor, opts.debt, dismissed]);

  return {
    handledActions,
    proactive,
    dismissProactive: () => setDismissed(true),
  };
}
