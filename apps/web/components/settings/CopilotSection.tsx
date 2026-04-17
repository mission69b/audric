"use client";

import { useState } from "react";
import { useCopilotPrefs } from "@/hooks/useCopilotPrefs";
import { useCopilotEnabled } from "@/hooks/useFeatureFlags";
import { SchedulesSection } from "./SchedulesSection";

interface CopilotSectionProps {
  address: string | null;
  jwt: string | null;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}

export function CopilotSection({ address, jwt }: CopilotSectionProps) {
  const enabled = useCopilotEnabled();
  const { prefs, loading, updating, update } = useCopilotPrefs(address, jwt);

  // Local select state — committed on change, optimistic via the hook.
  const [pendingHour, setPendingHour] = useState<number | null>(null);
  const hour = pendingHour ?? prefs.digestSendHourLocal;

  const handleHourChange = (next: number) => {
    setPendingHour(next);
    update(
      { digestSendHourLocal: next },
      {
        onSettled: () => setPendingHour(null),
      },
    );
  };

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
          Copilot
        </h2>
        <p className="text-sm text-muted leading-relaxed">
          Audric watches your portfolio and proposes one-tap actions. Nothing
          happens without your confirmation. Tune what you see and when below.
        </p>
      </header>

      {!enabled && (
        <div className="rounded-md border border-border bg-surface/50 p-3">
          <p className="text-xs text-dim leading-relaxed">
            Copilot is currently disabled for this account. Toggles save but
            won&apos;t take effect until it&apos;s re-enabled.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-dim mb-2">
          Notifications
        </h3>

        <ToggleRow
          label="Daily email digest"
          description="One email per day summarising suggestions waiting for you. Skipped automatically when there&apos;s nothing pending."
          checked={prefs.digestEnabled}
          disabled={loading}
          onChange={(next) => update({ digestEnabled: next })}
        />

        <div
          className={`rounded-md border border-border bg-surface/40 px-4 py-3 transition ${
            prefs.digestEnabled ? "" : "opacity-50 pointer-events-none"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-foreground">Digest send time</p>
              <p className="text-[11px] text-dim mt-0.5">
                Local time on your device — uses your saved timezone.
              </p>
            </div>
            <select
              value={hour}
              disabled={!prefs.digestEnabled || updating}
              onChange={(e) => handleHourChange(Number(e.target.value))}
              className="font-mono text-[12px] bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              aria-label="Digest send hour"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ToggleRow
          label="Health-factor widget"
          description="Always-on health-factor pill in the dashboard header. Critical email alerts stay on regardless."
          checked={prefs.hfWidgetEnabled}
          disabled={loading}
          onChange={(next) => update({ hfWidgetEnabled: next })}
        />
      </div>

      <div className="pt-4 border-t border-border">
        <SchedulesSection address={address} jwt={jwt} />
      </div>
    </section>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label
      className={`flex items-start justify-between gap-3 rounded-md border border-border bg-surface/40 px-4 py-3 cursor-pointer transition hover:bg-surface/60 ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex-1">
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-[11px] text-dim mt-0.5 leading-relaxed">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-border accent-foreground"
        aria-label={label}
      />
    </label>
  );
}
