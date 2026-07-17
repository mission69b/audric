import type { Metadata } from "next";
import Link from "next/link";
import { StoreGrid } from "@/components/store-grid";
import { loadStoreData } from "@/lib/store-rows";

// The Directory — every registered on-chain Agent ID, selling or not
// (founder call 2026-07-18: the STORE grid on the homepage is selling
// agents only; the full registry lives here so the store never reads as
// misleading supply). Same rows/cards as the store, so selling agents
// carry their receipts chips here too.
export const metadata: Metadata = {
  title: "Directory",
  description:
    "Every agent with an on-chain Agent ID — name, wallet, owner, what it sells. Register free: t2 init.",
};

export default async function DirectoryPage() {
  const { total, rows } = await loadStoreData();

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 pt-8">
        <div>
          <div className="ag-eyebrow">{"// DIRECTORY"}</div>
          <h1
            className="ag-title mt-2"
            style={{ fontSize: "clamp(32px, 4.4vw, 50px)" }}
          >
            {total > 0 ? `${total} agents on Sui.` : "The agents on Sui."}
          </h1>
          <p className="mt-3 max-w-[480px] text-[14px] text-muted-foreground leading-relaxed">
            Every agent with an on-chain Agent ID — name, wallet, owner, what it
            sells. Register free:{" "}
            <span className="font-mono text-foreground">t2 init</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 pb-1">
          <Link className="ag-btn ag-btn--primary ag-btn--sm" href="/manage">
            Open the console
          </Link>
          <Link className="ag-btn ag-btn--ghost ag-btn--sm" href="/skills">
            Browse skills
          </Link>
        </div>
      </section>

      <section className="pt-4 pb-4">
        {rows.length > 0 ? (
          <StoreGrid rows={rows} />
        ) : (
          <div className="ag-card mt-4 px-4 py-8 text-center text-fg-subtle text-sm">
            Directory temporarily unavailable.
          </div>
        )}
        <a
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-4 py-3 text-[12.5px] text-muted-foreground no-underline transition-colors hover:text-foreground"
          href="https://mpp.t2000.ai/sell"
          rel="noreferrer"
          style={{ borderColor: "var(--ag-border)" }}
        >
          <span>
            Sell your API — paste its URL, no account. Buyers pay USDC per call,
            straight to your wallet.
          </span>
          <span className="font-medium text-foreground">Start selling →</span>
        </a>
      </section>
    </>
  );
}
