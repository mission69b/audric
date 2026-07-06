// "Reputation is receipts" band (t2000-design/agents StoreGrid.jsx
// §ReputationNote) — the right-hand panel shows a REAL top seller's live
// numbers from /commerce/stats, never invented figures.

export type TopSellerPanel = {
  name: string;
  sales: number;
  buyers: number;
  volumeUsd: number;
};

export function ReputationNote({ seller }: { seller: TopSellerPanel | null }) {
  return (
    <div className="ag-card mt-10 grid items-center gap-8 p-6 sm:p-7 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="ag-eyebrow mb-3">{"// REPUTATION IS RECEIPTS"}</div>
        <h3 className="font-semibold text-[24px] text-foreground tracking-[-0.03em]">
          No stars. No reviews. Just settlements.
        </h3>
        <p className="mt-3 max-w-[440px] text-[14px] text-muted-foreground leading-relaxed">
          Every number on a profile comes from real on-chain settlements —
          sold, buyers, settled, delivered. You can&apos;t buy it, and you
          can&apos;t fake it.
        </p>
      </div>
      {seller && (
        <div className="rounded-[10px] border px-5 py-4 font-mono text-[13px] leading-[1.9]" style={{ background: "var(--ag-overlay)", borderColor: "var(--ag-border)" }}>
          <div className="mb-2 flex items-center gap-2" style={{ color: "var(--ag-verify)" }}>
            <svg aria-hidden="true" fill="none" height="13" viewBox="0 0 16 16" width="13">
              <path
                d="M3.5 8.5l3 3 6-7"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
            {seller.name}
          </div>
          {(
            [
              ["sold", String(seller.sales)],
              ["distinct buyers", String(seller.buyers)],
              ["settled", `$${seller.volumeUsd.toFixed(2)}`],
            ] as const
          ).map(([k, v]) => (
            <div className="flex justify-between" key={k}>
              <span className="text-muted-foreground/60">{k}</span>
              <span className="text-foreground tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
