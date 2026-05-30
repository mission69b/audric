"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { type ReactNode, Suspense, useEffect, useState } from "react";

import {
  ActivityHeatmapCanvas,
  CanvasCard,
  type CanvasData,
  DCAPlanner,
  FullPortfolioCanvas,
  HealthSimulatorCanvas,
  PortfolioTimelineCanvas,
  ReceiveAddressCanvas,
  SpendingBreakdownCanvas,
  WatchAddressCanvas,
  YieldProjectorCanvas,
} from "@/components/audric/cards/canvas";
import { cn } from "@/lib/utils";

const noop = () => {
  // harness has no backend
};

const ADDR = "0xe1c0e0a3d2e5d22c5d4c4e63b53f86d9a8e7f177";

/**
 * Dev-only preview harness for the R6.4 canvas templates.
 *
 * Pure (props-only) canvases — Receive, HealthSimulator, YieldProjector,
 * DCAPlanner — render fully from fixtures. Fetch-backed canvases
 * (FullPortfolio, Timeline, Heatmap, Spending, WatchAddress) render their
 * shell chrome + the loading / empty / fallback states (no auth in the
 * harness), which is enough to diff the phase2 `.canvas` chrome. The last
 * section wraps a canvas in `CanvasCard` so the expand button + C10 modal
 * can be screenshot end-to-end.
 *
 * Diff loop: `pnpm --filter @audric/web-v2 dev` → `/dev/canvas` → compare
 * to `t2000-AFI/audric/phase2-canvases.html` + `phase2-health-monitor.html`
 * at both themes + both widths.
 */
export default function CanvasHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const [narrow, setNarrow] = useState(false);
  // next-themes resolves the theme only on the client; gate the
  // theme-dependent toggle state behind mount so the first client render
  // matches the server (no hydration mismatch on the Light/Dark toggles).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const receiveCanvas: CanvasData = {
    template: "receive_address",
    title: "Your address",
    toolUseId: "harness-receive",
    data: {
      available: true,
      address: ADDR,
      isSelfRender: true,
      suinsName: "funkii@audric",
    },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Canvas harness · R6.4
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-canvases.html + phase2-health-monitor.html"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle
            active={!narrow}
            label="Desktop"
            onClick={() => setNarrow(false)}
          />
          <Toggle
            active={narrow}
            label="390px"
            onClick={() => setNarrow(true)}
          />
          <span className="mx-1 h-4 w-px bg-border" />
          <Toggle
            active={!isDark}
            label="Light"
            onClick={() => setTheme("light")}
          />
          <Toggle
            active={isDark}
            label="Dark"
            onClick={() => setTheme("dark")}
          />
        </div>
      </header>

      <main
        className={cn(
          "mx-auto flex flex-col gap-14 px-6 pt-12 pb-24",
          narrow ? "max-w-[390px]" : "max-w-[720px]"
        )}
      >
        <Section
          label="C5 · ReceiveAddress"
          note="QR + handle + addr pill + warn strip"
        >
          <ReceiveAddressCanvas
            data={{
              available: true,
              address: ADDR,
              isSelfRender: true,
              suinsName: "funkii@audric",
            }}
          />
        </Section>

        <Section
          label="C2 · HealthSimulator — safe"
          note="circular HF gauge + positions + sliders"
        >
          <HealthSimulatorCanvas
            data={{
              available: true,
              initialCollateral: 1847,
              initialDebt: 600,
              currentHf: 2.46,
            }}
            onAction={noop}
          />
        </Section>

        <Section
          label="C2 · HealthSimulator — watch"
          note="HF 1.3–2 · amber zone"
        >
          <HealthSimulatorCanvas
            data={{
              available: true,
              initialCollateral: 1066,
              initialDebt: 600,
              currentHf: 1.42,
            }}
            onAction={noop}
          />
        </Section>

        <Section
          label="C2 · HealthSimulator — danger"
          note="HF < 1.3 · guard blocks"
        >
          <HealthSimulatorCanvas
            data={{
              available: true,
              initialCollateral: 702,
              initialDebt: 600,
              currentHf: 0.94,
            }}
            onAction={noop}
          />
        </Section>

        <Section
          label="C2 · HealthSimulator — no position"
          note="∞ HF · borrow CTA"
        >
          <HealthSimulatorCanvas
            data={{
              available: true,
              initialCollateral: 1847,
              initialDebt: 0,
              currentHf: null,
            }}
            onAction={noop}
          />
        </Section>

        <Section
          label="Yield projector"
          note="sliders + compound curve + metrics"
        >
          <YieldProjectorCanvas
            data={{ available: true, initialAmount: 5000, initialApy: 5.24 }}
            onAction={noop}
          />
        </Section>

        <Section
          label="DCA planner"
          note="monthly slider + savings curve + metrics"
        >
          <DCAPlanner
            data={{ available: true, initialMonthly: 200, initialApy: 5.24 }}
            onAction={noop}
          />
        </Section>

        <Section
          label="C1 · FullPortfolio (fallback)"
          note="metric grid + alloc bars (no-auth fallback data)"
        >
          <FullPortfolioCanvas
            data={{
              available: true,
              address: ADDR,
              currentSavings: 605,
              currentDebt: 0,
              healthFactor: null,
              savingsRate: 0.0524,
            }}
            onAction={noop}
          />
        </Section>

        <Section
          label="C6 · Timeline (empty state)"
          note="shell + no-data state (no auth)"
        >
          <PortfolioTimelineCanvas
            data={{ available: true, address: ADDR, isSelfRender: true }}
            onAction={noop}
          />
        </Section>

        <Section
          label="C7 · Heatmap (empty state)"
          note="shell + cyan legend (no auth)"
        >
          <Suspense
            fallback={
              <div className="h-[180px] rounded-xl border border-border" />
            }
          >
            <ActivityHeatmapCanvas
              data={{ available: true, address: ADDR, isSelfRender: true }}
              onAction={noop}
            />
          </Suspense>
        </Section>

        <Section
          label="C8 · Spending (empty state)"
          note="donut + range tabs (no auth)"
        >
          <SpendingBreakdownCanvas
            data={{ available: true, address: ADDR }}
            onAction={noop}
          />
        </Section>

        <Section
          label="C9 · WatchAddress (empty state)"
          note="watch field + feed + footer (no auth)"
        >
          <WatchAddressCanvas
            data={{ available: true, address: ADDR, label: "vitalik.sui" }}
            onAction={noop}
          />
        </Section>

        <Section
          label="C10 · CanvasCard → expand → modal"
          note="click the expand icon top-right to open the modal"
        >
          <CanvasCard canvas={receiveCanvas} onSendMessage={noop} />
        </Section>
      </main>
    </div>
  );
}

function Section({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <p className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
        {`// ${label}`}
        <span className="ml-2 text-foreground/60 lowercase tracking-[0.01em]">
          {note}
        </span>
      </p>
      {children}
    </section>
  );
}

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-md px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] transition",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
