// AudricCloser — final CTA. Calm. One line. One button.
// Ported from `t2000-AFI/audric/AudricCloser.jsx` (R6.7); CTA invokes
// `useZkLogin().login`.

"use client";

import { useZkLogin } from "@/components/auth/use-zklogin";

export function AudricCloser() {
  const { login } = useZkLogin();

  return (
    <section style={{ padding: "120px 24px", textAlign: "center" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            fontSize: "clamp(40px, 6vw, 64px)",
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            margin: 0,
            color: "var(--fg)",
          }}
        >
          Money. <span style={{ color: "var(--fg-muted)" }}>By message.</span>
        </h2>
        <p
          style={{
            marginTop: 22,
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--fg-muted)",
            letterSpacing: "-0.011em",
            maxWidth: 500,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Sign in with Google. Audric handles the rest.
        </p>
        <div
          style={{
            marginTop: 32,
            display: "flex",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            className="t2k-btn t2k-btn--blue t2k-btn--lg"
            onClick={login}
            type="button"
          >
            Open Audric →
          </button>
        </div>
      </div>
    </section>
  );
}
