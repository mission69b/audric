// AudricNav — top nav for audric.ai.
// Ported from `t2000-AFI/audric/AudricNav.jsx` (R6.7 full port, 2026-05-30)
// onto web-v2: AudricMark replaces the SVG logo asset, the "Open Audric"
// CTA invokes `useZkLogin().login` (not a static app.audric.ai link), and
// the sticky background is theme-aware (color-mix off --bg) instead of the
// prototype's hardcoded dark rgba.

"use client";

import { AudricMark } from "@/components/ui/audric-mark";
import { useZkLogin } from "@/components/auth/use-zklogin";

const PRODUCTS = ["Passport", "Intelligence", "Finance", "Pay", "Store"];

export function AudricNav() {
  const { login } = useZkLogin();

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "color-mix(in oklch, var(--bg) 78%, transparent)",
        backdropFilter: "blur(12px) saturate(140%)",
        WebkitBackdropFilter: "blur(12px) saturate(140%)",
        borderBottom: "1px solid var(--ds-gray-alpha-300)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          height: 60,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            color: "var(--fg)",
            textDecoration: "none",
          }}
        >
          <AudricMark size={22} />
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              color: "var(--fg)",
            }}
          >
            audric
          </span>
        </a>

        <div
          className="au-nav-products"
          style={{ display: "flex", alignItems: "center", gap: 20, marginLeft: 12 }}
        >
          {PRODUCTS.map((l) => (
            <a className="au-nav-link" href="#products" key={l}>
              {l}
            </a>
          ))}
        </div>

        <span style={{ flex: 1 }} />

        <span className="au-signal-pill au-nav-pill">
          <span className="dot" />
          <span>Live · Sui</span>
        </span>

        <a
          className="au-nav-link au-nav-secondary"
          href="https://t2000.ai"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--fg-subtle)",
            letterSpacing: "0.01em",
            paddingLeft: 12,
            borderLeft: "1px solid var(--ds-gray-alpha-300)",
          }}
        >
          t2000.ai ↗
        </a>

        <button
          className="t2k-btn t2k-btn--blue t2k-btn--sm"
          onClick={login}
          style={{ whiteSpace: "nowrap" }}
          type="button"
        >
          Open Audric →
        </button>
      </div>
    </nav>
  );
}
