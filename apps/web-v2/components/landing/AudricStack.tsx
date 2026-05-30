// AudricStack — "Built on Sui" strip. Surfaces the underlying chain /
// stablecoin / identity without a sales pitch.
// Ported from `t2000-AFI/audric/AudricStack.jsx` (R6.7); row hover moves to
// the `.au-stack-row` CSS rule.

interface StackItem {
  label: string;
  role: string;
  desc: string;
  href: string;
}

const ITEMS: StackItem[] = [
  {
    label: "Sui",
    role: "ON-CHAIN",
    desc: "Sub-second settlement. USDC + USDsui native. Gasless stablecoin transfers.",
    href: "https://sui.io",
  },
  {
    label: "USDC",
    role: "STABLECOIN",
    desc: "Native USDC + USDsui. The dollars your agent actually moves.",
    href: "#products",
  },
  {
    label: "zkLogin",
    role: "IDENTITY",
    desc: "Sign in with Google. Non-custodial wallet in 3 seconds, no seed phrase.",
    href: "#products",
  },
];

export function AudricStack() {
  return (
    <section
      style={{
        background: "var(--ds-background-200)",
        borderTop: "1px solid var(--ds-gray-alpha-300)",
        borderBottom: "1px solid var(--ds-gray-alpha-300)",
        padding: "72px 0",
      }}
    >
      <div className="t2k-container">
        <header style={{ marginBottom: 32, maxWidth: 640 }}>
          <span className="t2k-eyebrow">// UNDERNEATH</span>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              fontSize: 28,
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
              margin: "12px 0 0",
              color: "var(--fg)",
            }}
          >
            Built on Sui.{" "}
            <span style={{ color: "var(--fg-muted)" }}>Gasless by default.</span>
          </h2>
        </header>

        <div style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}>
          {ITEMS.map((it) => (
            <a
              className="au-stack-row"
              href={it.href}
              key={it.label}
              style={{
                padding: "20px 4px",
                borderBottom: "1px solid var(--ds-gray-alpha-300)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 14,
                  color: "var(--fg)",
                  letterSpacing: "0.01em",
                }}
              >
                {it.label}
              </span>
              <span
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: "var(--fg-muted)",
                  letterSpacing: "-0.011em",
                }}
              >
                {it.desc}
              </span>
              <span
                className="au-stack-role"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: "var(--fg-subtle)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  textAlign: "right",
                }}
              >
                {it.role}
              </span>
              <span
                className="au-stack-arrow"
                style={{
                  color: "var(--fg-subtle)",
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ↗
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
