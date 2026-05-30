// AudricFooter — minimal: brand + family links + legal-light bottom.
// Ported from `t2000-AFI/audric/AudricFooter.jsx` (R6.7); the "Open Audric"
// action invokes `useZkLogin().login`, legal links point at web-v2's real
// /privacy /terms /disclaimer routes, and the brand mark uses AudricMark.

"use client";

import { useZkLogin } from "@/components/auth/use-zklogin";
import { AudricMark } from "@/components/ui/audric-mark";

interface FooterLink {
  l: string;
  href?: string;
  external?: boolean;
  soon?: boolean;
}

const FAMILY: FooterLink[] = [
  { l: "t2000.ai", href: "https://t2000.ai", external: true },
  { l: "mpp.t2000.ai", href: "https://mpp.t2000.ai", external: true },
  { l: "suimpp.dev", href: "https://suimpp.dev", external: true },
];

const LEGAL = ["Privacy", "Terms", "Disclaimer"];

export function AudricFooter() {
  const { login } = useZkLogin();

  const product: FooterLink[] = [
    { l: "Passport", href: "#products" },
    { l: "Intelligence", href: "#products" },
    { l: "Finance", href: "#products" },
    { l: "Pay", href: "#products" },
    { l: "Store", soon: true },
  ];

  return (
    <footer
      style={{
        borderTop: "1px solid var(--ds-gray-alpha-300)",
        padding: "48px 24px 28px",
      }}
    >
      <div className="t2k-container">
        <div className="au-footer-grid" style={{ marginBottom: 36 }}>
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 14,
                color: "var(--fg)",
              }}
            >
              <AudricMark size={16} />
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: "-0.022em",
                  color: "var(--fg)",
                }}
              >
                audric
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--fg-muted)",
                margin: 0,
                maxWidth: 320,
              }}
            >
              Conversational finance. Save, send, swap — by message. On Sui.
            </p>
            <div style={{ marginTop: 18 }}>
              <span className="au-signal-pill" style={{ padding: "3px 9px" }}>
                <span className="dot" />
                <span>Live · Sui</span>
              </span>
            </div>
          </div>

          <FooterCol login={login} title="Product" links={product} />
          <FooterCol login={login} title="Family" links={FAMILY} />
        </div>

        <hr className="t2k-rule" />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 20,
            gap: 24,
            flexWrap: "wrap",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--fg-subtle)",
          }}
        >
          <span>© 2026 t2000 AFI Inc. · Built on Sui</span>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {LEGAL.map((l) => (
              <a
                className="au-foot-link au-foot-link--muted"
                href={`/${l.toLowerCase()}`}
                key={l}
              >
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
  login,
}: {
  title: string;
  links: FooterLink[];
  login: () => void;
}) {
  return (
    <div>
      <div className="t2k-eyebrow" style={{ fontSize: 11, marginBottom: 16 }}>
        {title}
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 11,
        }}
      >
        {links.map((l) => (
          <li key={l.l}>
            <FooterLinkItem link={l} />
          </li>
        ))}
        {title === "Product" && (
          <li>
            <button
              className="au-foot-link"
              onClick={login}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
                fontSize: 13.5,
                letterSpacing: "-0.011em",
                fontFamily: "inherit",
              }}
              type="button"
            >
              Open Audric →
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function FooterLinkItem({ link }: { link: FooterLink }) {
  const base = {
    fontSize: 13.5,
    letterSpacing: "-0.011em",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } as const;

  if (link.soon) {
    return (
      <span
        className="au-foot-link--muted"
        style={{ ...base, color: "var(--fg-subtle)" }}
      >
        {link.l}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.08em",
            color: "var(--fg-subtle)",
            padding: "1px 6px",
            border: "1px solid var(--ds-gray-alpha-400)",
            borderRadius: 3,
            textTransform: "uppercase",
          }}
        >
          Q2
        </span>
      </span>
    );
  }

  return (
    <a
      className="au-foot-link"
      href={link.href ?? "#"}
      rel={link.external ? "noreferrer" : undefined}
      style={base}
      target={link.external ? "_blank" : undefined}
    >
      {link.l}
      {link.external && (
        <span style={{ opacity: 0.55, fontSize: 11 }}>↗</span>
      )}
    </a>
  );
}
