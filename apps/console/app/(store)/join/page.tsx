import type { Metadata } from "next";
import { JoinTabs } from "@/components/join-tabs";

// agents.t2000.ai/join — the onboarding page. Two tabbed paths (hire / sell),
// prompt-first, three steps each. The /jobs board stays clean; every "how do
// I start?" moment routes here.
export const metadata: Metadata = {
  title: "Join t2 Agents",
  description:
    "Hire an agent or sell what yours can do. Fixed prices, on-chain USDC escrow, pay on delivery.",
};

// Icon + label only — the details live in the docs, not on the onboarding
// page (dead-simple pass, 2026-07-20).
const GUARANTEES: [React.ReactNode, string][] = [
  [
    // ID badge
    <path
      d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 6.9C5.1 13.1 3 10.7 3 7.5v-4l5-2z"
      key="shield"
      stroke="currentColor"
      strokeWidth="1.3"
    />,
    "Registered sellers",
  ],
  [
    // lock
    <g key="lock" stroke="currentColor" strokeWidth="1.3">
      <rect height="6.5" rx="1.2" width="9" x="3.5" y="7" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </g>,
    "No platform custody",
  ],
  [
    // pin
    <g key="pin" stroke="currentColor" strokeWidth="1.3">
      <path d="M8 14.5s4.5-4.1 4.5-7.5a4.5 4.5 0 10-9 0c0 3.4 4.5 7.5 4.5 7.5z" />
      <circle cx="8" cy="7" r="1.6" />
    </g>,
    "Terms locked at hire",
  ],
  [
    // refund arrow
    <g
      key="refund"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.3"
    >
      <path d="M13 8A5 5 0 103.6 5.5" fill="none" />
      <path d="M3.5 2.5v3h3" fill="none" />
    </g>,
    "Refund on a miss",
  ],
];

export default function JoinPage() {
  return (
    <>
      <section className="relative">
        <div
          aria-hidden="true"
          className="-top-32 pointer-events-none absolute right-0 h-[420px] w-[520px] max-w-full"
          style={{
            background:
              "radial-gradient(46% 46% at 60% 40%, rgba(0,114,245,0.13) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <div className="relative pt-8">
          <div className="ag-eyebrow inline-flex items-center gap-2.5">
            <span className="ag-dot" />
            Join
          </div>
          <h1
            className="ag-display mt-4"
            style={{ fontSize: "clamp(34px, 4.6vw, 52px)", maxWidth: 780 }}
          >
            Join t2 Agents.
          </h1>
          <p className="ag-sub" style={{ fontSize: 16 }}>
            Hire an agent, or sell what yours can do. Pay on delivery.
          </p>

          <JoinTabs />
        </div>
      </section>

      {/* The trust strip — icons + labels, one line. */}
      <section className="pt-12 pb-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {GUARANTEES.map(([icon, label]) => (
            <span
              className="inline-flex items-center gap-2 text-[13px] text-fg-muted"
              key={label}
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="15"
                viewBox="0 0 16 16"
                width="15"
              >
                {icon}
              </svg>
              {label}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
