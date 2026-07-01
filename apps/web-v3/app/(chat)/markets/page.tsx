"use client";

/**
 * Markets — the /skills replacement (Perplexity-Finance-style, scoped to the
 * data we actually have): global pulse (cap / volume / dominance / Fear &
 * Greed), BTC·ETH·SUI 30d charts, and top movers — all from the SAME CMC lib
 * the chat skills use, via /api/markets (60s edge cache). Every row/card
 * drafts a question into the composer (?draft=), so the page feeds chat.
 */

import {
  LineChartIcon,
  PencilLineIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  fmtPct,
  fmtPrice,
  fmtUsdCompact,
  pctColor,
} from "@/components/chat/finance-format";
import type { PricePoint } from "@/components/chat/price-chart-inner";
import { fetcher } from "@/lib/utils";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const ChartInner = dynamic(
  () => import("@/components/chat/price-chart-inner"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[176px] w-full animate-pulse rounded-lg bg-muted/40" />
    ),
  }
);

type MoverRow = {
  name?: string;
  symbol?: string;
  priceUsd?: number;
  change24hPct?: number;
  marketCapUsd?: number;
};

type ChartData = {
  name?: string;
  symbol?: string;
  days?: number;
  series?: { date?: string; close?: number }[];
  summary?: { endUsd?: number; changePct?: number };
};

type MarketsData = {
  configured: boolean;
  updatedAt?: string;
  global?: {
    totalMarketCapUsd?: number;
    totalVolume24hUsd?: number;
    btcDominancePct?: number;
    ethDominancePct?: number;
    stablecoinMarketCapUsd?: number;
    fearGreedValue?: number;
    fearGreedLabel?: string;
  } | null;
  movers?: {
    gainers: MoverRow[];
    losers: MoverRow[];
    trending: MoverRow[];
  };
  charts?: ChartData[];
};

function Pulse({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-card/40 p-3">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="font-medium text-[15px] text-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}

function MoverList({
  title,
  rows,
  onAsk,
}: {
  title: string;
  rows: MoverRow[];
  onAsk: (prompt: string) => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
      <h3 className="mb-2 font-medium text-[13px] text-foreground">{title}</h3>
      <div className="flex flex-col">
        {rows.map((r) => (
          <button
            className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
            key={`${title}-${r.symbol}`}
            onClick={() => onAsk(`How is ${r.name ?? r.symbol} doing?`)}
            type="button"
          >
            <span className="w-14 shrink-0 font-medium text-[12.5px] text-foreground">
              {r.symbol}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
              {r.name}
            </span>
            <span className="text-[12.5px] text-foreground tabular-nums">
              {fmtPrice(r.priceUsd)}
            </span>
            <span
              className={`w-[72px] text-right text-[12.5px] tabular-nums ${pctColor(r.change24hPct)}`}
            >
              {fmtPct(r.change24hPct)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChartCard({
  chart,
  onAsk,
}: {
  chart: ChartData;
  onAsk: (prompt: string) => void;
}) {
  const data: PricePoint[] = (chart.series ?? []).flatMap((p) =>
    p.date && typeof p.close === "number"
      ? [{ date: p.date, close: p.close }]
      : []
  );
  if (data.length < 2) {
    return null;
  }
  const change = chart.summary?.changePct;
  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-[14px] text-foreground">
            {chart.symbol}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {chart.days ?? 30}d
          </span>
        </div>
        <button
          className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={() =>
            onAsk(`What's driving ${chart.name ?? chart.symbol} this month?`)
          }
          type="button"
        >
          Ask ↗
        </button>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-semibold text-[18px] text-foreground tabular-nums tracking-tight">
          {fmtPrice(chart.summary?.endUsd)}
        </span>
        <span className={`text-[12px] tabular-nums ${pctColor(change)}`}>
          {fmtPct(change)}
        </span>
      </div>
      <div className="mt-2">
        <ChartInner
          data={data}
          up={typeof change === "number" ? change >= 0 : true}
        />
      </div>
    </div>
  );
}

export default function MarketsPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<MarketsData>(
    `${BASE_PATH}/api/markets`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120_000 }
  );

  const ask = (prompt: string) => {
    router.push(`${BASE_PATH}/?draft=${encodeURIComponent(prompt)}`);
  };

  const g = data?.global;

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="mb-1 flex items-center gap-2">
          <LineChartIcon className="size-5 text-foreground" />
          <h1 className="font-semibold text-foreground text-xl">Markets</h1>
          <button
            aria-label="Back to chat"
            className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => router.push(`${BASE_PATH}/`)}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <p className="mb-8 text-muted-foreground text-sm">
          Live crypto market data — tap anything to ask Audric about it.
        </p>

        {isLoading && (
          <div className="flex flex-col gap-3">
            <div className="h-20 w-full animate-pulse rounded-2xl bg-muted/30" />
            <div className="h-56 w-full animate-pulse rounded-2xl bg-muted/30" />
            <div className="h-56 w-full animate-pulse rounded-2xl bg-muted/30" />
          </div>
        )}

        {data && !data.configured && (
          <p className="text-muted-foreground text-sm">
            Market data isn't configured right now — ask in chat instead: "how's
            the crypto market?"
          </p>
        )}

        {g && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Pulse
              label="Total market cap"
              value={fmtUsdCompact(g.totalMarketCapUsd)}
            />
            <Pulse
              label="24h volume"
              value={fmtUsdCompact(g.totalVolume24hUsd)}
            />
            <Pulse
              label="BTC dominance"
              value={
                typeof g.btcDominancePct === "number"
                  ? `${g.btcDominancePct.toFixed(1)}%`
                  : "—"
              }
            />
            <Pulse
              label="Fear & Greed"
              value={
                typeof g.fearGreedValue === "number"
                  ? `${g.fearGreedValue} · ${g.fearGreedLabel ?? ""}`
                  : "—"
              }
            />
          </div>
        )}

        {(data?.charts?.length ?? 0) > 0 && (
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data?.charts?.map((c) => (
              <ChartCard chart={c} key={c.symbol} onAsk={ask} />
            ))}
          </div>
        )}

        {data?.movers && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MoverList
              onAsk={ask}
              rows={data.movers.gainers}
              title="Top gainers (24h)"
            />
            <MoverList
              onAsk={ask}
              rows={data.movers.losers}
              title="Top losers (24h)"
            />
            <MoverList
              onAsk={ask}
              rows={data.movers.trending}
              title="Trending"
            />
          </div>
        )}

        <div className="mt-8 flex items-center gap-2 rounded-xl border border-border/40 bg-card/40 p-3">
          <TrendingUpIcon className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-[12.5px] text-muted-foreground">
            Want more? Ask anything — "research NVDA", "SUI price history", "top
            new tokens this week".
          </p>
          <button
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-border/40 px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
            onClick={() => ask("How's the crypto market today?")}
            type="button"
          >
            <PencilLineIcon className="size-3" />
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
