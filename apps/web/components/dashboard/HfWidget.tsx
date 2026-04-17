"use client";

import { useRouter } from "next/navigation";
import { useCopilotEnabled } from "@/hooks/useFeatureFlags";
import { useCopilotPrefs } from "@/hooks/useCopilotPrefs";
import { useCopilotSuggestions } from "@/hooks/useCopilotSuggestions";

interface HfWidgetProps {
  address: string | null;
  jwt: string | null;
  healthFactor: number | null;
  borrows: number;
}

interface HfTier {
  label: string;
  cls: string;
  ringCls: string;
}

function tierFor(hf: number): HfTier {
  if (hf < 1.5) {
    return {
      label: "low",
      cls: "border-error/50 bg-error/10 text-error",
      ringCls: "ring-error/30",
    };
  }
  if (hf < 2) {
    return {
      label: "watch",
      cls: "border-warning/40 bg-warning/10 text-warning",
      ringCls: "ring-warning/20",
    };
  }
  return {
    label: "ok",
    cls: "border-success/30 bg-success/5 text-success",
    ringCls: "ring-success/10",
  };
}

/**
 * Always-on health-factor pill in the dashboard chrome (Wave C.5).
 *
 * Renders nothing when:
 *   - COPILOT_ENABLED is false
 *   - user has no debt (HF only matters with active borrows)
 *   - user toggled `hfWidgetEnabled=false` in /settings/copilot
 *   - HF is null/Infinity (NAVI returns Infinity when collateral >> debt and
 *     no liquidation risk; we still render the green pill in that case via
 *     the >= 2 branch — Infinity reads as "very safe").
 *
 * On click: navigates to the matching `hf_topup` Copilot suggestion confirm
 * page when one exists. Falls back to a no-op (the colour itself is the
 * useful signal). We deliberately do NOT auto-create a suggestion here — the
 * detector cron owns surfacing logic so users don't get double-nagged.
 */
export function HfWidget({
  address,
  jwt,
  healthFactor,
  borrows,
}: HfWidgetProps) {
  const router = useRouter();
  const copilotEnabled = useCopilotEnabled();
  const { prefs } = useCopilotPrefs(address, jwt);
  const suggestions = useCopilotSuggestions(address, jwt);

  if (!copilotEnabled) return null;
  if (!prefs.hfWidgetEnabled) return null;
  if (borrows < 0.01) return null;
  if (healthFactor === null) return null;

  const hf = Number.isFinite(healthFactor) ? healthFactor : 99;
  const tier = tierFor(hf);

  const hfTopup = suggestions.data?.suggestions.find(
    (s) => s.kind === "copilot_suggestion" && s.type === "hf_topup",
  );

  const onClick = () => {
    if (!hfTopup) return;
    router.push(`/copilot/confirm/${hfTopup.kind}/${hfTopup.id}`);
  };

  const display = Number.isFinite(healthFactor)
    ? hf.toFixed(2)
    : "∞";

  const Tag = hfTopup ? "button" : "div";

  return (
    <Tag
      onClick={hfTopup ? onClick : undefined}
      className={`group inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] leading-none transition ${tier.cls} ${
        hfTopup ? `cursor-pointer hover:ring-2 ${tier.ringCls}` : ""
      }`}
      title={
        hfTopup
          ? "Health factor — tap to repay and lift it"
          : "Health factor — distance from liquidation"
      }
      aria-label={`Health factor ${display} (${tier.label})`}
    >
      <span className="opacity-70">HF</span>
      <span className="font-semibold tracking-tight">{display}</span>
      {hfTopup && (
        <span className="opacity-60 group-hover:opacity-100">→</span>
      )}
    </Tag>
  );
}
