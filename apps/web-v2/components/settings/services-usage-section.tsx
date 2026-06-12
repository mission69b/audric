"use client";

/**
 * Services usage — the spend/activity history half of the Usage page
 * (SPEC_AUDRIC_DEFI_REMOVAL §2e LOCKED S.387b: "merge spend/activity
 * history into /settings/services"; built S.410 after the S.409 audit
 * found the cut deleted the chat history cards without landing this).
 *
 * Data source: `/api/analytics/spending` — first-party DB ground truth
 * (`ServicePurchase` rows written on every paid mpp_call + AppEvent pay
 * fallback). Deliberately NO chain reads: no BlockVision, no RPC — the
 * consumption ledger is ours. The route lost its only consumer when the
 * `spending_analytics` engine tool was cut (S.401); this section is its
 * consumer now.
 */

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

type Period = "week" | "month" | "all";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "week", label: "7 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

interface SpendingByService {
  category: string;
  endpoint: string;
  requestCount: number;
  service: string;
  totalSpent: number;
}

interface SpendingResponse {
  byService: SpendingByService[];
  period: string;
  requestCount: number;
  serviceCount: number;
  totalSpent: number;
}

export function ServicesUsageSection({ address }: { address: string | null }) {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<SpendingResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    authFetch(
      `/api/analytics/spending?period=${period}&address=${encodeURIComponent(address)}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((json: SpendingResponse | null) => {
        if (!cancelled) {
          setData(json);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [address, period]);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-md border border-border bg-muted p-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.1em]">
            Services usage
          </p>
          <div className="flex gap-1.5">
            {PERIODS.map(({ value, label }) => {
              const active = value === period;
              return (
                <button
                  className={[
                    "rounded-sm border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition",
                    "focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:border-foreground hover:text-foreground",
                  ].join(" ")}
                  key={value}
                  onClick={() => setPeriod(value)}
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-4">
          <p className="font-mono text-[20px] text-foreground tabular-nums">
            ${(data?.totalSpent ?? 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {data?.requestCount ?? 0} call{data?.requestCount === 1 ? "" : "s"}{" "}
            across {data?.serviceCount ?? 0} service
            {data?.serviceCount === 1 ? "" : "s"}
          </p>
        </div>

        {data && data.byService.length > 0 ? (
          <ul className="mt-3.5 flex flex-col divide-y divide-border border-border border-t">
            {data.byService.map((s) => (
              <li
                className="flex items-center justify-between gap-3 py-2.5"
                key={s.endpoint}
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-foreground">
                    {s.service}
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.12em]">
                    {s.category} · {s.requestCount} call
                    {s.requestCount === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-[12px] text-foreground tabular-nums">
                  ${s.totalSpent.toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3.5 text-[11px] text-muted-foreground leading-[1.5]">
            {loading
              ? "Loading usage…"
              : "No Services spend in this period yet. When Audric pays for a Service, it shows up here."}
          </p>
        )}
      </div>
    </div>
  );
}
