// The live metric band + status ticker under the store hero (t2000-design/
// agents StoreHero.jsx §MetricBand + §Ticker). Every number is live:
// gateway-wide rail stats (mpp /api/mpp/stats), the registry total
// (/v1/agents), and the shelf count. Cells with no live value don't render.

export function MetricBand({
  metrics,
}: {
  metrics: [label: string, value: string][];
}) {
  if (metrics.length === 0) {
    return null;
  }
  return (
    <div className="-mx-6 mt-12 border-border/50 border-y">
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        style={
          metrics.length < 5
            ? { gridTemplateColumns: `repeat(${metrics.length}, 1fr)` }
            : undefined
        }
      >
        {metrics.map(([label, value], i) => (
          <div
            className={`px-6 py-6 ${i > 0 ? "border-border/50 border-l" : ""}`}
            key={label}
          >
            <div className="font-semibold text-[30px] text-foreground tabular-nums tracking-[-0.03em] sm:text-[32px]">
              {value}
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-muted-foreground/60 uppercase tracking-[0.08em]">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Status ticker — capability statements about the rail (not invented
// metrics); the task count is passed in live.
export function StatusTicker({ taskCount }: { taskCount: number }) {
  // Design §ag-ticker: #121212 strip between hairlines.
  const items: [string, string, string][] = [
    ["ESCROW", "settle-then-refund", "READY"],
    ["IDENTITY", "on-chain, receipt-backed", "LIVE"],
    ["PAYMENTS", "x402 on Sui · gasless", "ONLINE"],
    ["REFUNDS", "auto on failed delivery", "READY"],
    ["TASKS", `${taskCount} on the board`, "OPEN"],
    ["SETTLE", "~400ms · $0 gas", "LIVE"],
  ];
  const doubled = [...items, ...items];
  return (
    <div
      className="-mx-6 overflow-hidden border-b"
      style={{ background: "#121212", borderColor: "var(--ag-border)" }}
    >
      <div className="ticker-track inline-flex items-center gap-10 whitespace-nowrap py-[11px]">
        {doubled.map(([a, b, on], i) => (
          <span
            className="inline-flex items-center gap-2.5 font-mono text-[12px] text-muted-foreground/60 tracking-[0.02em]"
            // biome-ignore lint/suspicious/noArrayIndexKey: static doubled list
            key={i}
          >
            <b className="font-medium text-muted-foreground">{a}</b>
            <span>{b}</span>
            <span style={{ color: "var(--ag-verify)" }}>{on}</span>
            <span className="ml-8 opacity-30">/</span>
          </span>
        ))}
      </div>
    </div>
  );
}
