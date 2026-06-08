"use client";

/**
 * Services spending — daily MPP consumption ceiling (B-cap).
 *
 * A hard daily limit on what Audric can spend calling paid third-party
 * Services (mpp_call: live data, search, images, audio, mail, etc.).
 * Enforced server-side in `/api/mpp/budget` against the sum of today's
 * `ServicePurchase` rows; this UI just reads/writes the stored cap.
 *
 * Scope: Service consumption ONLY. It does NOT cap principal movements
 * (send / save / borrow) — those each tap-to-confirm under Passport
 * regardless of this setting.
 *
 * Storage: `UserPreferences.limits.mppDailyCapUsd` (number = ceiling,
 * `null` = off). Reads + writes go through the shared `usePreferences`
 * SWR slot, same partial-merge + optimistic-rollback contract the
 * Safety section uses.
 */

import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { usePreferences } from "@/lib/swr/user-preferences";

// `null` is the sentinel for "Off" (no ceiling). Numbers are the $/day cap.
const PRESETS: Array<{ value: number | null; label: string }> = [
  { value: 5, label: "$5" },
  { value: 10, label: "$10" },
  { value: 25, label: "$25" },
  { value: null, label: "Off" },
];

// Unset prefs fall back to the server default ($10) — keep in lockstep with
// DEFAULT_CAP_USD in app/api/mpp/budget/route.ts.
const DEFAULT_CAP_USD = 10;

interface ServicesSpendingSectionProps {
  address: string | null;
}

export function ServicesSpendingSection({
  address,
}: ServicesSpendingSectionProps) {
  const { data, isValidating, mutate } = usePreferences(address);
  const [customDraft, setCustomDraft] = useState("");

  // undefined (unset) → server default; null → Off; number → that cap.
  const current =
    data?.mppDailyCapUsd === undefined ? DEFAULT_CAP_USD : data.mppDailyCapUsd;

  const isPreset = PRESETS.some((p) => p.value === current);

  const commitCustom = () => {
    const parsed = Number.parseFloat(customDraft);
    if (!(Number.isFinite(parsed) && parsed > 0)) {
      return;
    }
    setCustomDraft("");
    // Floor to whole cents — the cap is compared against per-call USDC
    // amounts, which are 2dp.
    return updateCap(Math.round(parsed * 100) / 100);
  };

  const updateCap = async (next: number | null) => {
    if (!address || next === current || isValidating) {
      return;
    }
    await mutate(
      async (existing) => {
        const res = await authFetch("/api/user/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, limits: { mppDailyCapUsd: next } }),
        });
        if (!res.ok) {
          throw new Error(`Failed to update limit (HTTP ${res.status})`);
        }
        return existing
          ? { ...existing, mppDailyCapUsd: next }
          : { permissionPreset: "balanced", mppDailyCapUsd: next };
      },
      {
        optimisticData: (existing) =>
          existing
            ? { ...existing, mppDailyCapUsd: next }
            : { permissionPreset: "balanced", mppDailyCapUsd: next },
        rollbackOnError: true,
        revalidate: false,
      }
    );
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="mb-1.5 text-[13px] text-muted-foreground">
        Cap what Audric can spend per day calling paid Services on your behalf.
      </p>

      <div className="rounded-md border border-border bg-muted p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Daily Services limit
        </p>
        <p className="mt-1 mb-3.5 text-[12px] text-muted-foreground">
          The most Audric can spend in a day on third-party Services (live data,
          search, images, audio, mail). Once reached, Audric stops and asks you
          to raise the limit. Sends and savings are not affected.
        </p>

        <fieldset
          aria-label="Daily Services spending limit"
          className="m-0 grid grid-cols-4 gap-2 border-0 p-0"
        >
          {PRESETS.map(({ value, label }) => {
            const active = value === current;
            return (
              // biome-ignore lint/a11y/useSemanticElements: CSS-styled radio chip — native <input type="radio"> wouldn't support the mono uppercase chip styling
              <button
                aria-checked={active}
                className={[
                  "rounded-sm border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition",
                  "focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:border-foreground hover:text-foreground",
                ].join(" ")}
                disabled={!address || isValidating}
                key={label}
                onClick={() => updateCap(value)}
                role="radio"
                type="button"
              >
                {label}
              </button>
            );
          })}
        </fieldset>

        <form
          className="mt-2.5 flex items-center gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await commitCustom();
          }}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            Custom
          </span>
          <div className="relative flex-1">
            <span className="-translate-y-1/2 absolute top-1/2 left-2.5 font-mono text-[11px] text-muted-foreground">
              $
            </span>
            <input
              aria-label="Custom daily Services limit in USD per day"
              className="w-full rounded-sm border border-border bg-card py-2 pr-3 pl-5 font-mono text-[11px] text-foreground tabular-nums focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!address || isValidating}
              inputMode="decimal"
              min={0.01}
              onChange={(event) => setCustomDraft(event.target.value)}
              placeholder={
                current !== null && !isPreset ? String(current) : "e.g. 0.50"
              }
              step={0.01}
              type="number"
              value={customDraft}
            />
          </div>
          <button
            className="rounded-sm border border-border bg-card px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em] transition hover:border-foreground hover:text-foreground focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!address || isValidating || customDraft.trim() === ""}
            type="submit"
          >
            Set
          </button>
        </form>

        <p className="mt-3.5 text-[11px] leading-[1.5] text-muted-foreground">
          {current === null
            ? "No daily limit — Audric still asks you to confirm each Service call."
            : `Audric will pause Service spending after $${current} in a day. Each call still asks for your confirmation.`}
        </p>
      </div>
    </div>
  );
}
