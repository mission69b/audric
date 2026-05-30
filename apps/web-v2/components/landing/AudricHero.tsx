// AudricHero — calm conversational hero.
// Left: headline + sublead + CTA. Right: a chat-input mockup with a sample
// exchange. Ported from `t2000-AFI/audric/AudricHero.jsx` (R6.7, 2026-05-30):
// the prototype's vanilla-JS staged reveal becomes a `useEffect`, the CTA
// invokes `useZkLogin().login`, and the brand mark uses AudricMark.

"use client";

import { useEffect, useRef } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";
import { AudricMark } from "@/components/ui/audric-mark";
import { ToolCard } from "./AudricToolCard";

export function AudricHero() {
  const { login } = useZkLogin();

  return (
    <section
      style={{
        position: "relative",
        padding: "96px 0 80px",
        borderBottom: "1px solid var(--ds-gray-alpha-300)",
        overflow: "hidden",
      }}
    >
      <div className="t2k-container" style={{ position: "relative" }}>
        <div className="au-hero-grid">
          <div>
            <span className="au-signal-pill" style={{ marginBottom: 26 }}>
              <span className="dot" />
              <span>Live · Sui mainnet</span>
            </span>

            <h1
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 600,
                fontSize: "clamp(44px, 7vw, 80px)",
                lineHeight: 1,
                letterSpacing: "-0.045em",
                margin: 0,
                color: "var(--fg)",
              }}
            >
              Conversational
              <br />
              <span style={{ color: "var(--fg-muted)" }}>finance.</span>
            </h1>

            <p
              style={{
                marginTop: 26,
                fontSize: 19,
                lineHeight: 1.5,
                color: "var(--fg-muted)",
                letterSpacing: "-0.014em",
                maxWidth: 480,
              }}
            >
              Talk to your money. Save, send, swap — by message.
            </p>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 36,
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
              <a className="t2k-btn t2k-btn--ghost t2k-btn--lg" href="#how">
                See it work
              </a>
            </div>

            <div
              style={{
                marginTop: 22,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg-subtle)",
                letterSpacing: "0.02em",
              }}
            >
              Sign in with Google · non-custodial wallet in 3s · no seed phrase
            </div>
          </div>

          <HeroChat />
        </div>
      </div>
    </section>
  );
}

const STEP_DELAYS = [300, 900, 1700, 2400];

function HeroChat() {
  const convoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const convo = convoRef.current;
    if (!convo) {
      return;
    }
    const steps = Array.from(
      convo.querySelectorAll<HTMLElement>(".au-step")
    );
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      for (const s of steps) {
        s.style.opacity = "1";
      }
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const [i, s] of steps.entries()) {
      s.style.opacity = "0";
      s.style.transform = "translateY(8px)";
      s.style.transition =
        "opacity 360ms var(--ease-out), transform 360ms var(--ease-out)";
      timers.push(
        setTimeout(() => {
          s.style.opacity = "1";
          s.style.transform = "translateY(0)";
        }, STEP_DELAYS[i] ?? i * 700)
      );
    }
    return () => {
      for (const t of timers) {
        clearTimeout(t);
      }
    };
  }, []);

  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--ds-gray-alpha-400)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "var(--shadow-float)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: "1px solid var(--ds-gray-alpha-300)",
          background: "var(--ds-gray-100)",
        }}
      >
        <AudricMark size={14} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--fg)",
            letterSpacing: "0.01em",
          }}
        >
          audric
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-subtle)",
            letterSpacing: "0.06em",
          }}
        >
          NEW CHAT
        </span>
      </header>

      <div
        className="au-hero-convo"
        ref={convoRef}
        style={{
          padding: "18px 18px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 320,
        }}
      >
        <div className="au-bubble au-bubble--user au-step">
          Send $200 to sarah@audric
        </div>

        <div className="au-step">
          <ToolCard
            footerLeft="Arrives in ~0.4s"
            footerRight={<span className="ok">✓ ready</span>}
            rows={[
              { l: "To", v: "sarah@audric" },
              {
                l: "You send",
                v: <span className="au-tool-card__amount">200.00 USDC</span>,
              },
              {
                l: "Fee",
                v: <span className="au-tool-card__amount">$0.00</span>,
              },
            ]}
            tag="PAYMENT"
          />
        </div>

        <div
          className="au-bubble au-bubble--user au-step"
          style={{ maxWidth: "auto", width: "auto", alignSelf: "flex-end" }}
        >
          Yes, send it
        </div>

        <div
          className="au-bubble au-bubble--agent au-step"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <span style={{ color: "var(--signal)" }}>✓</span>
          Sent · <strong>200 USDC</strong> arrived in <strong>0.4s</strong>.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderTop: "1px solid var(--ds-gray-alpha-300)",
          background: "var(--ds-gray-100)",
        }}
      >
        <input
          placeholder="Ask Audric…"
          style={{
            flex: 1,
            appearance: "none",
            border: 0,
            background: "transparent",
            color: "var(--fg)",
            outline: "none",
            fontFamily: "var(--font-sans)",
            fontSize: 13.5,
            letterSpacing: "-0.011em",
          }}
          type="text"
        />
        <button
          aria-label="Send"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: "var(--fg)",
            color: "var(--ds-background-100)",
            border: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          type="button"
        >
          <svg fill="none" height="14" viewBox="0 0 16 16" width="14">
            <title>Send</title>
            <path
              d="M8 13 L8 3 M3 8 L8 3 L13 8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
