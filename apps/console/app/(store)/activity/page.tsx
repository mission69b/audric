import {
  escrowEconomyStats,
  getAgentNamesByAddresses,
  listRecentEscrowJobs,
} from "@audric/accounts";
import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, shortAddress } from "@/lib/format";
import {
  fetchGatewayServices,
  fetchRailPayments,
  fetchRailStats,
  type GatewayService,
} from "@/lib/gateway-services";

// /activity — THE feed. The whole economy's settlements in one list
// (t2 ACP Phase 2): escrow-job lifecycle events from the event-indexed
// ledger interleaved with x402 rail payments (proxied rows logged at settle
// time, direct rows chain-verified via /api/mpp/report). Rows link to the
// seller's store page and to their on-chain proof — the same receipts every
// reputation number on an agent page is computed from.
const SUISCAN = "https://suiscan.xyz/mainnet";
const GATEWAY = "https://mpp.t2000.ai";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Activity — t2 Agents",
  description:
    "Every settlement in the agent economy, on-chain. Escrowed jobs and machine payments, each row linked to its Sui proof.",
};

const JOB_STATE_LABEL: Record<string, string> = {
  funded: "Job funded",
  delivered: "Work delivered",
  released: "Job settled",
  rejected: "Delivery rejected",
  refunded: "Escrow refunded",
};

type FeedRow = {
  key: string;
  atMs: number;
  kind: "job" | "call";
  /** Bold lead: service name (calls) or lifecycle label (jobs). */
  title: string;
  /** Store-page link for the title, when the seller has one. */
  titleHref: string | null;
  detail: string;
  sender: string | null;
  amount: string;
  proofHref: string | null;
};

function sellerHref(service: GatewayService | undefined): string | null {
  if (!service) {
    return null;
  }
  // Store pages render for every payTo wallet (claimed or not); proxied
  // gateway services have no wallet of their own — link the rail page.
  return service.payTo
    ? `/${service.payTo}`
    : `${GATEWAY}/services/${service.id}`;
}

export default async function ActivityPage() {
  const [{ payments, total }, railStats, services, econ, recentJobs] =
    await Promise.all([
      fetchRailPayments(60),
      fetchRailStats(),
      fetchGatewayServices(),
      escrowEconomyStats().catch(() => null),
      listRecentEscrowJobs(40).catch(() => []),
    ]);
  const byId = new Map(services.map((s) => [s.id, s]));
  // All-time settled = escrow releases + x402 call volume (same composition
  // as the homepage's Settled USDC — one name per number across pages).
  const settledUsd =
    (econ ? econ.settledMicroUsdc / 1_000_000 : 0) +
    (railStats ? Number.parseFloat(railStats.totalVolume) || 0 : 0);

  // Job parties with registered Agent IDs render by name, not raw address.
  const names = await getAgentNamesByAddresses(
    recentJobs.flatMap((j) => [j.seller, j.buyer])
  ).catch(() => new Map<string, { name: string; numericId: number | null }>());
  const nameOf = (address: string): string =>
    names.get(address.toLowerCase())?.name ?? shortAddress(address);

  const feed: FeedRow[] = [
    ...recentJobs.map(
      (j): FeedRow => ({
        key: `job-${j.jobId}-${j.state}`,
        atMs: j.updatedAtMs,
        kind: "job",
        title: JOB_STATE_LABEL[j.state] ?? j.state,
        titleHref: `/${j.seller}`,
        detail: nameOf(j.seller),
        sender: j.buyer,
        amount: (j.amountMicroUsdc / 1_000_000).toFixed(2),
        proofHref: `${SUISCAN}/object/${j.jobId}`,
      })
    ),
    ...payments.map((p): FeedRow => {
      const service = byId.get(p.service);
      return {
        key: `call-${p.id}`,
        atMs: new Date(p.createdAt).getTime(),
        kind: "call",
        title: service?.name ?? p.service,
        titleHref: sellerHref(service),
        detail: p.endpoint,
        sender: p.sender,
        amount: p.amount,
        proofHref: p.digest ? `${SUISCAN}/tx/${p.digest}` : null,
      };
    }),
  ].sort((a, b) => b.atMs - a.atMs);

  return (
    <>
      <section className="pt-8">
        <div className="ag-eyebrow">{"// ACTIVITY"}</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <h1
            className="ag-title"
            style={{ fontSize: "clamp(32px, 4.4vw, 50px)" }}
          >
            Every settlement, on-chain.
          </h1>
          <p className="m-0 max-w-[380px] pb-1 text-fg-subtle text-xs leading-relaxed">
            Escrowed jobs and paid calls, each linked to its on-chain proof.
            Every reputation number is computed from these rows.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* All-time numbers, names matching the homepage stats band — one
              name per number across pages (S.765 audit). */}
          {[
            [
              "Settled USDC",
              econ || railStats ? `$${settledUsd.toFixed(2)}` : "—",
            ],
            ["Paid calls", total.toLocaleString()],
            ["Escrowed jobs", econ ? econ.totalJobs.toLocaleString() : "—"],
            [
              "Active wallets",
              econ ? econ.distinctWallets.toLocaleString() : "—",
            ],
          ].map(([label, value]) => (
            <div className="ag-card px-4 py-3" key={label}>
              <div className="font-semibold text-[20px] text-foreground tracking-[-0.02em]">
                {value}
              </div>
              <div className="mt-0.5 text-[11px] text-fg-subtle uppercase tracking-wide">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-6 pb-4">
        <div className="ag-card divide-y divide-border/50 overflow-hidden">
          {feed.map((row) => (
            <div
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              key={row.key}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      row.kind === "job"
                        ? "var(--ag-accent)"
                        : "var(--ag-verify)",
                  }}
                />
                {row.titleHref ? (
                  row.titleHref.startsWith("/") ? (
                    <Link
                      className="shrink-0 font-medium text-foreground no-underline hover:underline"
                      href={row.titleHref}
                    >
                      {row.title}
                    </Link>
                  ) : (
                    <a
                      className="shrink-0 font-medium text-foreground no-underline hover:underline"
                      href={row.titleHref}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {row.title}
                    </a>
                  )
                ) : (
                  <span className="shrink-0 font-medium text-foreground">
                    {row.title}
                  </span>
                )}
                <span className="truncate font-mono text-[12px] text-muted-foreground">
                  {row.detail}
                </span>
                {row.sender && (
                  <span className="hidden truncate font-mono text-[11px] text-fg-subtle md:inline">
                    {row.kind === "job"
                      ? nameOf(row.sender)
                      : shortAddress(row.sender)}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="font-medium text-foreground">
                  ${row.amount}
                </span>
                <span className="hidden text-fg-subtle text-xs sm:inline">
                  {formatDate(new Date(row.atMs).toISOString())}
                </span>
                {row.proofHref && (
                  <a
                    className="text-fg-subtle text-xs underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                    href={row.proofHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {row.kind === "job" ? "job ↗" : "tx ↗"}
                  </a>
                )}
              </div>
            </div>
          ))}
          {feed.length === 0 && (
            <div className="px-4 py-8 text-center text-fg-subtle text-sm">
              Feed temporarily unavailable.
            </div>
          )}
        </div>
        {payments.length > 0 && (
          <p className="mt-3 text-[12px] text-fg-subtle">
            Latest {feed.length} settlements — jobs from{" "}
            <a
              className="font-mono text-fg-muted underline decoration-border underline-offset-4 hover:text-foreground"
              href="https://api.t2000.ai/v1/jobs?seller="
              rel="noreferrer"
              target="_blank"
            >
              /v1/jobs
            </a>
            , calls from{" "}
            <a
              className="font-mono text-fg-muted underline decoration-border underline-offset-4 hover:text-foreground"
              href={`${GATEWAY}/api/mpp/payments`}
              rel="noreferrer"
              target="_blank"
            >
              /api/mpp/payments
            </a>
          </p>
        )}
      </section>
    </>
  );
}
