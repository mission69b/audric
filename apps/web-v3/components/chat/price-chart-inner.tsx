"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtPrice } from "./finance-format";

/** Recharts area chart for a daily close series. Loaded ONLY via next/dynamic
 * (see price-chart.tsx) so recharts stays out of the main chat bundle. */

export type PricePoint = { date: string; close: number };

export default function PriceChartInner({
  data,
  up,
}: {
  data: PricePoint[];
  up: boolean;
}) {
  const stroke = up ? "#10b981" : "#ef4444";
  return (
    <ResponsiveContainer height={176} width="100%">
      <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="price-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          axisLine={false}
          dataKey="date"
          interval="preserveStartEnd"
          minTickGap={48}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          tickFormatter={(d: string) =>
            new Date(d).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          domain={["auto", "auto"]}
          orientation="right"
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: number) => fmtPrice(v).replace("$", "")}
          tickLine={false}
          width={56}
        />
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0];
            if (!(active && p)) {
              return null;
            }
            const point = p.payload as PricePoint;
            return (
              <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-md">
                <div className="text-muted-foreground">
                  {new Date(point.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <div className="font-medium tabular-nums">
                  {fmtPrice(point.close)}
                </div>
              </div>
            );
          }}
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
        />
        <Area
          dataKey="close"
          fill="url(#price-fill)"
          stroke={stroke}
          strokeWidth={1.75}
          type="monotone"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
