"use client";

/**
 * Safety settings — permission preset.
 *
 * v0.7c Phase 6 Session 2 scope (per `s2-api-usage` lock):
 *   - Permission preset radio group (load-bearing: drives chat autonomy)
 *   - Per-operation USD threshold table (informational)
 *   - NO API usage card (pay_api deleted from engine in S.245; capability returns
 *     as Commerce primitive in Audric Store SPEC)
 *   - NO Daily API budget input (same reason)
 *
 * Reads + writes go through the shared `usePreferences` SWR cache slot
 * (Session 4.7.A). Writes post a PARTIAL payload (`permissionPreset`
 * only) and optimistically patch the cache; failures roll back cleanly.
 *
 * Permission constants come from `@t2000/engine/presets` — a client-safe
 * subpath export (added in engine v2.11.1, v0.7c Session 4.6 fix #3)
 * that re-exports the pure-data presets without dragging in Node-only
 * engine internals. Single source of truth for the runtime gating and
 * the UI display.
 */

import { PERMISSION_PRESETS } from "@t2000/engine/presets";
import { audricWebUrl } from "@/lib/audric-web-url";
import { authFetch } from "@/lib/auth-fetch";
import {
  type PermissionPreset,
  usePreferences,
} from "@/lib/swr/user-preferences";

const OPERATIONS: Array<{ key: string; label: string }> = [
  { key: "save", label: "save / repay" },
  { key: "send", label: "send" },
  { key: "swap", label: "swap" },
  { key: "withdraw", label: "withdraw" },
  { key: "pay", label: "pay" },
  { key: "borrow", label: "borrow" },
];

const PRESET_ORDER: PermissionPreset[] = [
  "conservative",
  "balanced",
  "aggressive",
];

const usdFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtUsd = (n: number) => `$${usdFmt.format(n)}`;

function getRule(preset: PermissionPreset, opKey: string) {
  const config = PERMISSION_PRESETS[preset];
  const rule = config.rules.find((r) => r.operation === opKey);
  const autoBelow = rule?.autoBelow ?? config.globalAutoBelow;
  const confirmBetween = rule?.confirmBetween ?? 1000;
  return { autoBelow, confirmBetween };
}

function fmtCell(
  tier: "auto" | "confirm" | "explicit",
  autoBelow: number,
  confirmBetween: number
): string {
  if (tier === "auto") {
    if (autoBelow <= 0) {
      return "\u2014";
    }
    return `\u2264 ${fmtUsd(autoBelow)}`;
  }
  if (tier === "confirm") {
    if (autoBelow <= 0) {
      return `\u2264 ${fmtUsd(confirmBetween)}`;
    }
    return `${fmtUsd(autoBelow)}\u2009\u2013\u2009${fmtUsd(confirmBetween)}`;
  }
  return `> ${fmtUsd(confirmBetween)}`;
}

interface SafetySectionProps {
  address: string | null;
}

export function SafetySection({ address }: SafetySectionProps) {
  const { data, isValidating, mutate } = usePreferences(address);
  const preset: PermissionPreset = data?.permissionPreset ?? "balanced";

  const updatePreset = async (next: PermissionPreset) => {
    if (!address || next === preset || isValidating) {
      return;
    }
    await mutate(
      async (current) => {
        const res = await authFetch(audricWebUrl("/api/user/preferences"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, permissionPreset: next }),
        });
        if (!res.ok) {
          throw new Error(`Failed to update preset (HTTP ${res.status})`);
        }
        return current
          ? { ...current, permissionPreset: next }
          : { contacts: [], permissionPreset: next };
      },
      {
        optimisticData: (current) =>
          current
            ? { ...current, permissionPreset: next }
            : { contacts: [], permissionPreset: next },
        rollbackOnError: true,
        revalidate: false,
      }
    );
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="mb-1.5 text-[13px] text-fg-secondary">
        Control spending limits and transaction safety settings.
      </p>

      <div className="rounded-md border border-border-subtle bg-surface-sunken p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">
          Auto-approve permissions
        </p>
        <p className="mt-1 mb-3.5 text-[12px] text-fg-secondary">
          Per-operation USD thresholds that decide when Audric acts on its own,
          asks for a one-tap confirm, or requires an explicit instruction.
        </p>

        <fieldset
          aria-label="Permission preset"
          className="m-0 grid grid-cols-3 gap-2 border-0 p-0"
        >
          {PRESET_ORDER.map((p) => {
            const active = p === preset;
            return (
              // biome-ignore lint/a11y/useSemanticElements: CSS-styled radio chip — native <input type="radio"> wouldn't support the mono uppercase chip styling
              <button
                aria-checked={active}
                className={[
                  "rounded-sm border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition",
                  "focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "border-fg-primary bg-fg-primary text-fg-inverse"
                    : "border-border-strong bg-surface-card text-fg-secondary hover:border-fg-primary hover:text-fg-primary",
                ].join(" ")}
                disabled={!address || isValidating}
                key={p}
                onClick={() => updatePreset(p)}
                role="radio"
                type="button"
              >
                {p}
              </button>
            );
          })}
        </fieldset>

        <div className="mt-4 border-t border-border-subtle pt-3.5">
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))] items-center gap-x-5 border-b border-border-subtle pb-1.5">
            <span aria-hidden="true" />
            <span className="text-right font-mono text-[9px] uppercase tracking-[0.12em] text-fg-muted">
              Auto
            </span>
            <span className="text-right font-mono text-[9px] uppercase tracking-[0.12em] text-fg-muted">
              Confirm
            </span>
            <span className="text-right font-mono text-[9px] uppercase tracking-[0.12em] text-fg-muted">
              Explicit
            </span>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(72px,auto))] items-center gap-x-5">
            {OPERATIONS.map(({ key, label }, idx) => {
              const { autoBelow, confirmBetween } = getRule(preset, key);
              const last = idx === OPERATIONS.length - 1;
              const rowClass = [
                "py-2",
                last ? "" : "border-b border-border-subtle",
              ].join(" ");
              return (
                <div className="contents" key={key}>
                  <span className={`${rowClass} text-[12px] text-fg-secondary`}>
                    {label}
                  </span>
                  <span
                    className={`${rowClass} text-right font-mono text-[11px] tabular-nums text-fg-primary`}
                  >
                    {fmtCell("auto", autoBelow, confirmBetween)}
                  </span>
                  <span
                    className={`${rowClass} text-right font-mono text-[11px] tabular-nums text-fg-primary`}
                  >
                    {fmtCell("confirm", autoBelow, confirmBetween)}
                  </span>
                  <span
                    className={`${rowClass} text-right font-mono text-[11px] tabular-nums text-fg-primary`}
                  >
                    {fmtCell("explicit", autoBelow, confirmBetween)}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-3.5 text-[11px] leading-[1.5] text-fg-muted">
            Above the confirm threshold, Audric always asks before signing.
            Daily ceiling for auto-approved actions:{" "}
            <span className="font-mono text-fg-secondary">
              {fmtUsd(PERMISSION_PRESETS[preset].autonomousDailyLimit)}
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
