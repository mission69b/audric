'use client';

// [PHASE 10] Safety sub-section — re-skinned to match
// `design_handoff_audric/.../settings.jsx` Safety block.
//
// Layout:
//   • Description paragraph
//   • AUTO-APPROVE PERMISSIONS card (sunken bg, 3 preset pills, 4-col table
//     showing per-operation USD ranges for AUTO / CONFIRM / EXPLICIT tiers).
//     Restored from the pre-redesign SettingsPanel drawer (deleted in commit
//     f4a998c) — backend (`POST /api/user/preferences` with `permissionPreset`
//     + `engine-factory.ts` reading `userPrefs.limits` as `UserPermissionConfig`)
//     was never removed, only the surface.
//   • API USAGE card (sunken bg, mono eyebrow with month, large headline
//     amount + "across N calls to N services" sub-line, divider, then
//     per-service rows label/right-aligned value).
//   • DAILY API BUDGET card (sunken bg, mono eyebrow + description, then
//     $ + numeric input + "per day").
//
// Behavior preserved:
//   • `address` prop unchanged
//   • `fetch('/api/analytics/spending?period=month')` data shape untouched
//   • Daily-budget onBlur POST to `/api/user/preferences` untouched
//   • New: GET `/api/user/preferences?address=...` reads `permissionPreset`,
//     POST same route persists it. Both routes already shipped on main.

import { useEffect, useState, useCallback } from 'react';

type PermissionPreset = 'conservative' | 'balanced' | 'aggressive';

// Mirror of `PERMISSION_PRESETS` exported from `@t2000/engine` (currently pinned
// to 0.40.4 in apps/web/package.json). Inlined here because the engine barrel
// pulls in Node-only deps (`fs`) that can't resolve in a client bundle.
//
// SOURCE OF TRUTH for runtime gating remains the engine: POST
// `/api/user/preferences` only sends the preset *name* — `engine-factory.ts`
// loads the actual `UserPermissionConfig` from `userPrefs.limits` and the
// engine calls `resolvePermissionTier()` against it. These constants drive the
// settings table only; if the engine ever rebalances the presets, refresh the
// values below.
type PermissionRuleDisplay = {
  globalAutoBelow: number;
  autonomousDailyLimit: number;
  rules: Record<string, { autoBelow: number; confirmBetween: number }>;
};

const PERMISSION_PRESETS_DISPLAY: Record<PermissionPreset, PermissionRuleDisplay> = {
  conservative: {
    globalAutoBelow: 5,
    autonomousDailyLimit: 100,
    rules: {
      save: { autoBelow: 5, confirmBetween: 100 },
      send: { autoBelow: 5, confirmBetween: 100 },
      borrow: { autoBelow: 0, confirmBetween: 100 },
      withdraw: { autoBelow: 5, confirmBetween: 100 },
      swap: { autoBelow: 5, confirmBetween: 100 },
      pay: { autoBelow: 1, confirmBetween: 25 },
      repay: { autoBelow: 5, confirmBetween: 100 },
    },
  },
  balanced: {
    globalAutoBelow: 10,
    autonomousDailyLimit: 200,
    rules: {
      save: { autoBelow: 50, confirmBetween: 1000 },
      send: { autoBelow: 10, confirmBetween: 200 },
      borrow: { autoBelow: 0, confirmBetween: 500 },
      withdraw: { autoBelow: 25, confirmBetween: 500 },
      swap: { autoBelow: 25, confirmBetween: 300 },
      pay: { autoBelow: 1, confirmBetween: 50 },
      repay: { autoBelow: 50, confirmBetween: 1000 },
    },
  },
  aggressive: {
    globalAutoBelow: 25,
    autonomousDailyLimit: 500,
    rules: {
      save: { autoBelow: 100, confirmBetween: 2000 },
      send: { autoBelow: 25, confirmBetween: 500 },
      borrow: { autoBelow: 10, confirmBetween: 1000 },
      withdraw: { autoBelow: 50, confirmBetween: 1000 },
      swap: { autoBelow: 50, confirmBetween: 500 },
      pay: { autoBelow: 5, confirmBetween: 100 },
      repay: { autoBelow: 100, confirmBetween: 2000 },
    },
  },
};

interface SpendingSummary {
  totalSpent: number;
  requestCount: number;
  serviceCount: number;
  period: string;
  byService: Array<{ service: string; totalSpent: number; requestCount: number }>;
}

interface SafetySectionProps {
  address: string | null;
}

// Operations we surface in the table. Mirrors `PermissionOperation` from the
// engine, ordered by frequency-of-use rather than alphabetically.
const OPERATIONS: Array<{ key: string; label: string }> = [
  { key: 'save', label: 'save' },
  { key: 'send', label: 'send' },
  { key: 'swap', label: 'swap' },
  { key: 'withdraw', label: 'withdraw' },
  { key: 'pay', label: 'pay' },
  { key: 'borrow', label: 'borrow' },
  { key: 'repay', label: 'repay' },
];

const PRESET_ORDER: PermissionPreset[] = ['conservative', 'balanced', 'aggressive'];

const usdFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmtUsd = (n: number) => `$${usdFmt.format(n)}`;

function getRule(preset: PermissionPreset, opKey: string) {
  const config = PERMISSION_PRESETS_DISPLAY[preset];
  const rule = config.rules[opKey];
  const autoBelow = rule?.autoBelow ?? config.globalAutoBelow;
  const confirmBetween = rule?.confirmBetween ?? 1000;
  return { autoBelow, confirmBetween };
}

function fmtCell(
  tier: 'auto' | 'confirm' | 'explicit',
  autoBelow: number,
  confirmBetween: number,
): string {
  if (tier === 'auto') {
    if (autoBelow <= 0) return '\u2014';
    return `\u2264 ${fmtUsd(autoBelow)}`;
  }
  if (tier === 'confirm') {
    if (autoBelow <= 0) return `\u2264 ${fmtUsd(confirmBetween)}`;
    return `${fmtUsd(autoBelow)}\u2009\u2013\u2009${fmtUsd(confirmBetween)}`;
  }
  return `> ${fmtUsd(confirmBetween)}`;
}

export function SafetySection({ address }: SafetySectionProps) {
  const [spending, setSpending] = useState<SpendingSummary | null>(null);
  const [preset, setPreset] = useState<PermissionPreset>('balanced');
  const [presetSaving, setPresetSaving] = useState(false);

  const fetchSpending = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/analytics/spending?period=month`, {
        headers: { 'x-sui-address': address },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.totalSpent === 'number') setSpending(data);
      }
    } catch {
      /* ignore */
    }
  }, [address]);

  const fetchPreset = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/user/preferences?address=${address}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.permissionPreset && PRESET_ORDER.includes(data.permissionPreset)) {
          setPreset(data.permissionPreset);
        }
      }
    } catch {
      /* ignore */
    }
  }, [address]);

  useEffect(() => {
    fetchSpending();
    fetchPreset();
  }, [fetchSpending, fetchPreset]);

  const updatePreset = async (next: PermissionPreset) => {
    if (!address || next === preset || presetSaving) return;
    const previous = preset;
    setPreset(next);
    setPresetSaving(true);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, permissionPreset: next }),
      });
      if (!res.ok) setPreset(previous);
    } catch {
      setPreset(previous);
    } finally {
      setPresetSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[13px] text-fg-secondary mb-1.5">
        Control spending limits and transaction safety settings.
      </p>

      <div className="rounded-md border border-border-subtle bg-surface-sunken p-4">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          Auto-approve permissions
        </p>
        <p className="text-[12px] text-fg-secondary mt-1 mb-3.5">
          Per-operation USD thresholds that decide when Audric acts on its own,
          asks for a one-tap confirm, or requires an explicit instruction.
        </p>

        <div
          role="radiogroup"
          aria-label="Permission preset"
          className="grid grid-cols-3 gap-2"
        >
          {PRESET_ORDER.map((p) => {
            const active = p === preset;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!address || presetSaving}
                onClick={() => updatePreset(p)}
                className={[
                  'px-3 py-2 rounded-sm font-mono text-[10px] tracking-[0.12em] uppercase transition border',
                  'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  active
                    ? 'bg-fg-primary text-bg-primary border-fg-primary'
                    : 'bg-surface-card text-fg-secondary border-border-strong hover:text-fg-primary hover:border-fg-primary',
                ].join(' ')}
              >
                {p}
              </button>
            );
          })}
        </div>

        <div className="mt-4 pt-3.5 border-t border-border-subtle">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-2 items-center">
            <span aria-hidden="true" />
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted text-right">
              Auto
            </span>
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted text-right">
              Confirm
            </span>
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted text-right">
              Explicit
            </span>

            {OPERATIONS.map(({ key, label }) => {
              const { autoBelow, confirmBetween } = getRule(preset, key);
              return (
                <div key={key} className="contents">
                  <span className="text-[12px] text-fg-secondary lowercase">{label}</span>
                  <span className="font-mono text-[11px] text-fg-primary text-right tabular-nums">
                    {fmtCell('auto', autoBelow, confirmBetween)}
                  </span>
                  <span className="font-mono text-[11px] text-fg-primary text-right tabular-nums">
                    {fmtCell('confirm', autoBelow, confirmBetween)}
                  </span>
                  <span className="font-mono text-[11px] text-fg-primary text-right tabular-nums">
                    {fmtCell('explicit', autoBelow, confirmBetween)}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-fg-muted mt-3.5 leading-[1.5]">
            Above the confirm threshold, Audric always asks before signing.
            Daily ceiling for auto-approved actions:{' '}
            <span className="font-mono text-fg-secondary">
              {fmtUsd(PERMISSION_PRESETS_DISPLAY[preset].autonomousDailyLimit)}
            </span>
            .
          </p>
        </div>
      </div>

      {spending && spending.requestCount > 0 && (
        <div className="rounded-md border border-border-subtle bg-surface-sunken p-4">
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
            API usage &mdash; {spending.period}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[22px] font-medium text-fg-primary tracking-[-0.01em]">
              ${spending.totalSpent.toFixed(2)}
            </span>
            <span className="text-[12px] text-fg-muted">
              across {spending.requestCount} call{spending.requestCount !== 1 ? 's' : ''} to{' '}
              {spending.serviceCount} service{spending.serviceCount !== 1 ? 's' : ''}
            </span>
          </div>
          {spending.byService.length > 0 && (
            <div className="mt-3.5 pt-3.5 border-t border-border-subtle flex flex-col gap-2">
              {spending.byService.slice(0, 5).map((s) => (
                <div key={s.service} className="flex items-center justify-between text-[13px]">
                  <span className="text-fg-secondary">{s.service}</span>
                  <span className="text-fg-primary">
                    ${s.totalSpent.toFixed(2)}{' '}
                    <span className="text-fg-muted">({s.requestCount})</span>
                  </span>
                </div>
              ))}
              {spending.byService.length > 5 && (
                <p className="text-[10px] text-fg-muted">+ {spending.byService.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border border-border-subtle bg-surface-sunken p-4">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          Daily API budget
        </p>
        <p className="text-[12px] text-fg-secondary mt-1 mb-3.5">
          Maximum daily spend on MPP services
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-fg-muted">$</span>
          <input
            type="number"
            min={0}
            step={0.1}
            defaultValue={1.0}
            className="w-[60px] px-2.5 py-2 border border-border-strong rounded-sm text-[13px] text-fg-primary bg-surface-card outline-none focus:border-fg-primary transition"
            onBlur={async (e) => {
              if (!address) return;
              const val = parseFloat(e.target.value);
              if (isNaN(val) || val < 0) return;
              try {
                await fetch('/api/user/preferences', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ address, limits: { dailyApiBudget: val } }),
                });
              } catch {
                /* ignore */
              }
            }}
          />
          <span className="text-[13px] text-fg-muted">per day</span>
        </div>
      </div>
    </div>
  );
}
