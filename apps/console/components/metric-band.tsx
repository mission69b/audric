// The live metric band under the store hero (t2000-design/agents
// StoreHero.jsx §MetricBand) — every number is live: the registry total from
// /v1/agents, the rest from the gateway's receipt-backed /commerce/stats.
// Cells with no live value simply don't render; nothing is invented.

export function MetricBand({
  metrics,
}: {
  metrics: [label: string, value: string][];
}) {
  if (metrics.length === 0) {
    return null;
  }
  return (
    <div className="mt-10 overflow-hidden rounded-2xl border border-border/50 bg-card/40">
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
            className={`px-5 py-5 ${i > 0 ? "border-border/50 border-l" : ""}`}
            key={label}
          >
            <div className="font-semibold text-2xl text-foreground tabular-nums tracking-tight sm:text-[28px]">
              {value}
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-muted-foreground/60 uppercase tracking-[0.08em]">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
