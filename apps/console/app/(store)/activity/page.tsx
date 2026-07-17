import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, shortAddress } from "@/lib/format";
import {
  fetchGatewayServices,
  fetchRailPayments,
  fetchRailVolume,
  type GatewayService,
} from "@/lib/gateway-services";

// /activity — THE feed (SPEC_T2_AGENTS_STORE §1). Every settlement on the
// rail, one list: proxied rows logged at settle time, direct rows
// chain-verified via /api/mpp/report. Rows link to the seller's store page
// and to the Sui transaction — the same receipts the per-agent reputation
// is computed from, store-wide.
const SUISCAN = "https://suiscan.xyz/mainnet";
const GATEWAY = "https://mpp.t2000.ai";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Activity — t2 Agents",
  description:
    "Every settlement on the rail, on-chain. Machine payments between agents and APIs, each row linked to its Sui transaction.",
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
  const [{ payments, total }, days, services] = await Promise.all([
    fetchRailPayments(60),
    fetchRailVolume(),
    fetchGatewayServices(),
  ]);
  const byId = new Map(services.map((s) => [s.id, s]));
  const weekCalls = days.reduce((n, d) => n + d.count, 0);
  const weekVolume = days.reduce((n, d) => n + d.volume, 0);

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
            The store keeps no private ledger — this feed is the rail&apos;s
            payment log, and every reputation number on an agent page is
            computed from these rows.
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Settlements", total.toLocaleString()],
            ["Calls · 7d", weekCalls.toLocaleString()],
            ["Volume · 7d", `$${weekVolume.toFixed(2)}`],
            ["Services live", String(services.length)],
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
          {payments.map((p) => {
            const service = byId.get(p.service);
            const href = sellerHref(service);
            return (
              <div
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                key={p.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-emerald-500">✓</span>
                  {href ? (
                    href.startsWith("/") ? (
                      <Link
                        className="shrink-0 font-medium text-foreground no-underline hover:underline"
                        href={href}
                      >
                        {service?.name ?? p.service}
                      </Link>
                    ) : (
                      <a
                        className="shrink-0 font-medium text-foreground no-underline hover:underline"
                        href={href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {service?.name ?? p.service}
                      </a>
                    )
                  ) : (
                    <span className="shrink-0 font-medium text-foreground">
                      {p.service}
                    </span>
                  )}
                  <span className="truncate font-mono text-[12px] text-muted-foreground">
                    {p.endpoint}
                  </span>
                  {p.sender && (
                    <span className="hidden truncate font-mono text-[11px] text-fg-subtle md:inline">
                      {shortAddress(p.sender)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="font-medium text-foreground">
                    ${p.amount}
                  </span>
                  <span className="hidden text-fg-subtle text-xs sm:inline">
                    {formatDate(p.createdAt)}
                  </span>
                  {p.digest && (
                    <a
                      className="text-fg-subtle text-xs underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                      href={`${SUISCAN}/tx/${p.digest}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      tx ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {payments.length === 0 && (
            <div className="px-4 py-8 text-center text-fg-subtle text-sm">
              Feed temporarily unavailable.
            </div>
          )}
        </div>
        {payments.length > 0 && (
          <p className="mt-3 text-[12px] text-fg-subtle">
            Showing the latest {payments.length} of {total.toLocaleString()}{" "}
            settlements. Full machine feed:{" "}
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
