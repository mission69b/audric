'use client';

import Link from 'next/link';
import type { AllowanceStatus } from '@/hooks/useAllowanceStatus';

type Feature = 'hf_alert' | 'briefing' | 'rate_alert' | 'auto_compound';

interface FeaturesSectionProps {
  allowance: AllowanceStatus;
  prefs: Record<Feature, boolean>;
  prefsLoading: boolean;
  toggling: Feature | null;
  toggle: (feature: Feature) => Promise<void>;
}

const NOTIFICATION_FEATURES: Array<{ key: Feature; label: string; description: string; free: boolean; cost?: string }> = [
  { key: 'hf_alert', label: 'Health factor alerts', description: 'Get notified when your credit position is at risk of liquidation', free: true },
  { key: 'briefing', label: 'Morning briefing', description: 'Daily summary of your earnings, rates, and suggested actions', free: false, cost: '$0.005/day' },
  { key: 'rate_alert', label: 'Rate change alerts', description: 'Get notified when USDC savings or borrow rates change significantly', free: true },
  { key: 'auto_compound', label: 'Auto-compound rewards', description: 'Automatically claim and re-deposit NAVX rewards into your savings', free: false, cost: '$0.005/day' },
];

export function FeaturesSection({ allowance, prefs, prefsLoading, toggling, toggle }: FeaturesSectionProps) {
  return (
    <section className="space-y-5">
      <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">Features</h2>

      {allowance.loading ? (
        <p className="text-sm text-muted">Loading budget...</p>
      ) : allowance.allowanceId ? (
        <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Features budget</span>
            <span className="text-sm text-foreground font-medium">
              ${allowance.balance !== null ? allowance.balance.toFixed(2) : '\u2014'}
            </span>
          </div>
          {allowance.balance !== null && allowance.balance < 0.05 && (
            <p className="text-xs text-warning">Budget running low. Top up to keep features active.</p>
          )}
          <div className="flex gap-2 pt-1">
            <Link href="/setup" className="rounded-md border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition">
              Top Up
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <p className="text-sm text-muted leading-relaxed">
            Set up a features budget to enable paid notifications like morning briefings and rate alerts.
          </p>
          <Link href="/setup" className="inline-block rounded-md bg-foreground px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-background uppercase hover:opacity-90 transition">
            Set Up Budget
          </Link>
        </div>
      )}

      <p className="text-sm text-muted leading-relaxed">
        Control which notifications Audric sends you. Health factor alerts are always free.
      </p>

      {prefsLoading ? (
        <p className="text-sm text-muted">Loading preferences...</p>
      ) : (
        <div className="space-y-1">
          {NOTIFICATION_FEATURES.map((f) => (
            <div key={f.key} className="flex items-start justify-between py-3 border-b border-border last:border-0">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground font-medium">{f.label}</span>
                  {f.free && (
                    <span className="font-mono text-[9px] tracking-wider text-success uppercase bg-success/10 px-1.5 py-0.5 rounded">Free</span>
                  )}
                  {f.cost && (
                    <span className="font-mono text-[9px] tracking-wider text-muted uppercase bg-surface px-1.5 py-0.5 rounded">{f.cost}</span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{f.description}</p>
              </div>
              <button
                onClick={() => toggle(f.key)}
                disabled={toggling === f.key}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors mt-0.5 focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-1 focus-visible:ring-offset-background outline-none ${
                  prefs[f.key] ? 'bg-foreground' : 'bg-[var(--n700)]'
                } ${toggling === f.key ? 'opacity-50' : ''}`}
                role="switch"
                aria-checked={prefs[f.key]}
              >
                <span className={`pointer-events-none inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-background transition-transform ${
                  prefs[f.key] ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}>
                  {prefs[f.key] && (
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6l2.5 2.5 5-5" stroke="var(--foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
