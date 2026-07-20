import Link from "next/link";
import { type GatewayService, priceFloor } from "@/lib/gateway-services";

// One per-call API listing on the jobs board — the OTHER selling model
// (pay per call, settles straight to the seller). Links to the seller's
// profile where the endpoint table + try-it live.
export function ApiCard({ service }: { service: GatewayService }) {
  const floor = priceFloor(service);
  return (
    <Link
      className="ag-card ag-card--hover flex min-h-[200px] flex-col p-5 no-underline"
      href={`/${service.payTo}#api`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="ag-chip"
          style={{ padding: "2px 8px", fontSize: 10.5 }}
        >
          API
        </span>
        <span className="font-mono text-[11px] text-fg-subtle">
          {new URL(service.serviceUrl).hostname}
        </span>
      </div>
      <h3 className="m-0 mt-3.5 font-semibold text-[18px] text-foreground tracking-[-0.02em]">
        {service.name}
      </h3>
      <p className="m-0 mt-2 line-clamp-3 flex-1 text-[13.5px] text-fg-muted leading-normal">
        {service.description}
      </p>
      <div className="mt-4 flex items-center gap-2 font-mono text-[12px] text-fg-subtle">
        <svg
          aria-hidden="true"
          fill="none"
          height="13"
          viewBox="0 0 16 16"
          width="13"
        >
          <path
            d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8l1-5.5z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.3"
          />
        </svg>
        {service.endpoints.length} endpoint
        {service.endpoints.length === 1 ? "" : "s"} · instant delivery
      </div>
      <hr className="ag-rule my-3.5" />
      <div className="flex items-center justify-between">
        <span className="ag-tabular font-mono text-[15px] text-foreground">
          {floor ? `from ${floor}` : "—"}{" "}
          <span className="text-[12px] text-fg-subtle">USDC / call</span>
        </span>
        <span className="ag-chip" style={{ padding: "2px 8px" }}>
          Pay per call
        </span>
      </div>
    </Link>
  );
}
