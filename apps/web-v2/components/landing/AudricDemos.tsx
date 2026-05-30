// AudricDemos — "Show, don't tell": two side-by-side conversations
// (cross-border pay + idle-cash yield). Ported from
// `t2000-AFI/audric/AudricDemos.jsx` (R6.7).

import type { ReactNode } from "react";
import { ToolCard } from "./AudricToolCard";

export function AudricDemos() {
  return (
    <section className="t2k-section" id="how">
      <div className="t2k-container">
        <header style={{ marginBottom: 48, maxWidth: 640 }}>
          <span className="t2k-eyebrow">// HOW IT WORKS</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            Ask. Confirm. Done.
          </h2>
          <p className="t2k-section-sub">
            Audric does the work. You see the action before money moves.
          </p>
        </header>

        <div className="au-grid-2">
          <DemoCard
            num="01"
            sub="Cross-border in under a second. No SWIFT, no holds, no fees."
            tag="MOVE MONEY"
            title="Pay anyone, anywhere."
          >
            <div className="au-bubble au-bubble--user">Pay 50 USDC to alice.sui</div>
            <ToolCard
              footerLeft="Arrives in ~0.4s"
              footerRight={<span className="ok">✓ ready</span>}
              rows={[
                { l: "To", v: "alice.sui" },
                {
                  l: "You send",
                  v: <span className="au-tool-card__amount">50.00 USDC</span>,
                },
                {
                  l: "Fee",
                  v: <span className="au-tool-card__amount">$0.00</span>,
                },
              ]}
              tag="PAYMENT"
            />
            <div className="au-bubble au-bubble--agent">
              <span style={{ color: "var(--signal)", marginRight: 6 }}>✓</span>
              Sent · <strong>50 USDC</strong> in <strong>0.41s</strong>.
            </div>
          </DemoCard>

          <DemoCard
            num="02"
            sub="Audric watches your balance and earns on it. NAVI, Cetus, Sui-native."
            tag="EARN YIELD"
            title="Idle cash isn't idle."
          >
            <div className="au-bubble au-bubble--user">
              What's my idle cash doing?
            </div>
            <ToolCard
              footerLeft="Earning $0/yr"
              footerRight={<span style={{ color: "var(--fg-muted)" }}>0.0% APY</span>}
              rows={[
                {
                  l: "USDC",
                  v: <span className="au-tool-card__amount">1,847.20</span>,
                },
                {
                  l: "USDsui",
                  v: <span className="au-tool-card__amount">50.00</span>,
                },
              ]}
              tag="BALANCE"
            />
            <div className="au-bubble au-bubble--agent">
              You're leaving <strong>$96/yr</strong> on the table. Save it to NAVI
              at 5.2% APY?
            </div>
          </DemoCard>
        </div>
      </div>
    </section>
  );
}

interface DemoCardProps {
  num: string;
  tag: string;
  title: string;
  sub: string;
  children: ReactNode;
}

function DemoCard({ num, tag, title, sub, children }: DemoCardProps) {
  return (
    <div className="t2k-card" style={{ display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          borderBottom: "1px solid var(--ds-gray-alpha-300)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-subtle)",
              letterSpacing: "0.06em",
            }}
          >
            {num}
          </span>
          <span
            style={{ width: 1, height: 12, background: "var(--ds-gray-alpha-400)" }}
          />
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              fontSize: 17,
              letterSpacing: "-0.022em",
              color: "var(--fg)",
            }}
          >
            {title}
          </h3>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
          {tag}
        </span>
      </header>

      <div style={{ padding: "14px 20px 6px" }}>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--fg-muted)",
            margin: 0,
            letterSpacing: "-0.011em",
          }}
        >
          {sub}
        </p>
      </div>

      <div
        style={{
          padding: "18px 20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {children}
      </div>
    </div>
  );
}
