// AudricProducts — the 5 sub-products. Live row (Passport · Intelligence ·
// Finance · Pay) 4-up, then Store full-width with a Q2 pill.
// Ported from `t2000-AFI/audric/AudricProducts.jsx` (R6.7); card hover moves
// from an inline mouse handler to the `.au-product-card` CSS rule.

interface Product {
  tag: string;
  title: string;
  desc: string;
  soon?: boolean;
}

const LIVE: Product[] = [
  {
    tag: "AUDRIC PASSPORT",
    title: "Sign in. Skip the seed phrase.",
    desc: "One Google tap mints a non-custodial wallet in 3 seconds. On-chain identity, no gas, nothing to back up.",
  },
  {
    tag: "AUDRIC INTELLIGENCE",
    title: "Knows your money before you ask.",
    desc: "26 tools, 14 guards. It reads your balances, watches your spend, and calls the move before you do.",
  },
  {
    tag: "AUDRIC FINANCE",
    title: "Save, borrow, swap, compound.",
    desc: "3–8% APY on USDC and USDsui. All of Sui DeFi — none of the dashboards. Just chat.",
  },
  {
    tag: "AUDRIC PAY",
    title: "Money in. Money out.",
    desc: "Send USDC and USDsui free, in 0.4s. Links, QR, invoices. Bank offramp to 70+ countries lands Q2.",
  },
];

const SOON: Product[] = [
  {
    tag: "AUDRIC STORE",
    title: "Sell anything. Keep 92%.",
    desc: "AI creates, Walrus stores, Seal gates. 92% to the creator, on-chain receipts.",
    soon: true,
  },
];

export function AudricProducts() {
  return (
    <section className="t2k-section" id="products">
      <div className="t2k-container">
        <header style={{ marginBottom: 48, maxWidth: 720 }}>
          <span className="t2k-eyebrow">// THE STACK</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            Audric Products.
          </h2>
          <p className="t2k-section-sub">
            Identity, intelligence, finance, payments, store — all in one chat.
          </p>
        </header>

        <div className="au-grid-4" style={{ marginBottom: 14 }}>
          {LIVE.map((p) => (
            <ProductCard key={p.tag} p={p} />
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
          {SOON.map((p) => (
            <ProductCard key={p.tag} p={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductCard({ p }: { p: Product }) {
  const { soon } = p;
  return (
    <div
      className="t2k-card au-product-card"
      style={{
        padding: "22px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: soon ? 0.92 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--fg-subtle)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {p.tag}
        </span>
        {soon && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.08em",
              color: "var(--fg-subtle)",
              padding: "2px 7px",
              border: "1px solid var(--ds-gray-alpha-400)",
              borderRadius: 3,
              textTransform: "uppercase",
            }}
          >
            Q2
          </span>
        )}
      </div>

      <h3
        style={{
          margin: 0,
          fontFamily: "var(--font-sans)",
          fontWeight: 600,
          fontSize: 19,
          lineHeight: 1.2,
          letterSpacing: "-0.025em",
          color: soon ? "var(--fg-muted)" : "var(--fg)",
        }}
      >
        {p.title}
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: soon ? "var(--fg-subtle)" : "var(--fg-muted)",
          letterSpacing: "-0.011em",
        }}
      >
        {p.desc}
      </p>
    </div>
  );
}
