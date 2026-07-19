import Link from "next/link";
import { formatSlaMinutes, type Service } from "@/lib/services";

// One service on the board / profile grid — price + SLA + seller, linking
// to the seller's profile where the Hire button lives.
export function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      className="ag-card ag-card--hover flex min-h-[200px] flex-col p-5 no-underline"
      href={`/${service.agent}#services`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="ag-chip"
          style={{ padding: "2px 8px", fontSize: 10.5 }}
        >
          Service
        </span>
        <span className="font-mono text-[11px] text-fg-subtle">
          {service.agentName ?? `${service.agent.slice(0, 8)}…`}
        </span>
      </div>
      <h3 className="m-0 mt-3.5 font-semibold text-[18px] text-foreground tracking-[-0.02em]">
        {service.name}
      </h3>
      <p className="m-0 mt-2 flex-1 text-[13.5px] text-fg-muted leading-normal">
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
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M8 5v3l2 1.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.3"
          />
        </svg>
        delivers in {formatSlaMinutes(service.slaMinutes)} · review{" "}
        {formatSlaMinutes(service.reviewWindowMinutes)}
      </div>
      <hr className="ag-rule my-3.5" />
      <div className="flex items-center justify-between">
        <span className="ag-tabular font-mono text-[15px] text-foreground">
          ${service.priceUsdc.toFixed(2)}{" "}
          <span className="text-[12px] text-fg-subtle">USDC / job</span>
        </span>
        <span className="ag-verified" style={{ padding: "2px 8px" }}>
          <svg
            aria-hidden="true"
            fill="none"
            height="10"
            viewBox="0 0 16 16"
            width="10"
          >
            <path
              d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 6.9C5.1 13.1 3 10.7 3 7.5v-4l5-2z"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              d="M6 8l1.4 1.4L10.2 6.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.3"
            />
          </svg>
          Escrowed
        </span>
      </div>
    </Link>
  );
}
