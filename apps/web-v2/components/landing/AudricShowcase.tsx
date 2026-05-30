// AudricShowcase — "See it work": three real app frames (balance home,
// PermissionCard, health canvas) as device-less product shots.
// Ported from `t2000-AFI/audric/AudricShowcase.jsx` (R6.7); the scroll-
// triggered staggered fade-up becomes a `useEffect` + IntersectionObserver.

"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";

export function AudricShowcase() {
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const frames = Array.from(group.children) as HTMLElement[];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      for (const f of frames) {
        f.style.opacity = "1";
      }
      return;
    }
    for (const [i, f] of frames.entries()) {
      f.style.opacity = "0";
      f.style.transform = "translateY(12px)";
      f.style.transition = `opacity 500ms var(--ease-out) ${i * 80}ms, transform 500ms var(--ease-out) ${i * 80}ms`;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            for (const f of frames) {
              f.style.opacity = "1";
              f.style.transform = "translateY(0)";
            }
            io.disconnect();
          }
        }
      },
      { threshold: 0.25 }
    );
    io.observe(group);
    return () => io.disconnect();
  }, []);

  return (
    <section
      className="t2k-section"
      style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}
    >
      <div className="t2k-container">
        <header style={{ marginBottom: 44, maxWidth: 720 }}>
          <span className="t2k-eyebrow">// SEE IT WORK</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            Your money, in chat.
          </h2>
          <p className="t2k-section-sub">
            Ask a question, confirm an action, watch it settle. Every screen is
            the real thing.
          </p>
        </header>

        <div className="au-grid-3" ref={groupRef}>
          <ShotFrame label="Home">
            <div
              style={{
                padding: "32px 18px 24px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 40,
                  fontWeight: 500,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                $1,853
              </div>
              <div
                style={{
                  marginTop: 9,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                }}
              >
                AVAILABLE{" "}
                <strong style={{ color: "var(--fg)", fontWeight: 500 }}>
                  $1,247
                </strong>{" "}
                · EARNING{" "}
                <strong style={{ color: "var(--fg)", fontWeight: 500 }}>
                  $605
                </strong>
              </div>
              <div
                style={{
                  marginTop: 18,
                  fontSize: 15,
                  fontWeight: 500,
                  letterSpacing: "-0.022em",
                }}
              >
                Good evening, Sam
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 5,
                padding: "0 16px 4px",
              }}
            >
              {["SAVE", "SEND", "SWAP", "RECEIVE"].map((c) => (
                <span
                  key={c}
                  style={{
                    height: 26,
                    padding: "0 11px",
                    display: "inline-flex",
                    alignItems: "center",
                    border: "1px solid var(--ds-gray-alpha-400)",
                    borderRadius: 9999,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    color: "var(--fg-muted)",
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </ShotFrame>

          <ShotFrame label="Confirm">
            <div
              style={{
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "85%",
                  padding: "8px 12px",
                  background: "var(--fg)",
                  color: "var(--bg)",
                  borderRadius: "12px 12px 4px 12px",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Send $50 to alice@audric
              </div>
              <div
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--ds-gray-alpha-300)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "11px 14px",
                    borderBottom: "1px solid var(--ds-gray-alpha-300)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9.5,
                      color: "var(--fg-muted)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    SEND · USDC
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9.5,
                      color: "var(--fg-muted)",
                    }}
                  >
                    58s
                  </span>
                </div>
                <div
                  style={{
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  {[
                    ["To", "alice@audric"],
                    ["Amount", "50.00 USDC"],
                    ["Fee", "$0.00"],
                  ].map(([l, v]) => (
                    <div
                      key={l}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12.5,
                        color: "var(--fg-muted)",
                      }}
                    >
                      <span>{l}</span>
                      <strong
                        style={{
                          color: "var(--fg)",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 500,
                        }}
                      >
                        {v}
                      </strong>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column-reverse",
                    gap: 6,
                    padding: "10px 14px 12px",
                    borderTop: "1px solid var(--ds-gray-alpha-300)",
                  }}
                >
                  <button style={btnPrimary} type="button">
                    Send 50 USDC
                  </button>
                </div>
              </div>
            </div>
          </ShotFrame>

          <ShotFrame label="Analyze">
            <div
              style={{
                padding: "20px 18px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div style={{ position: "relative", width: 110, height: 110 }}>
                <svg
                  style={{
                    width: "100%",
                    height: "100%",
                    transform: "rotate(-90deg)",
                  }}
                  viewBox="0 0 100 100"
                >
                  <title>Health factor 2.84</title>
                  <circle
                    cx="50"
                    cy="50"
                    fill="none"
                    r="42"
                    stroke="var(--ds-gray-100)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    fill="none"
                    r="42"
                    stroke="var(--ds-green-700)"
                    strokeDasharray="264"
                    strokeDashoffset="60"
                    strokeLinecap="round"
                    strokeWidth="8"
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 26,
                      fontWeight: 500,
                      letterSpacing: "-0.025em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    2.84
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8.5,
                      color: "var(--fg-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginTop: 2,
                    }}
                  >
                    Health · Safe
                  </span>
                </div>
              </div>
              <div style={{ width: "100%" }}>
                {[
                  ["Collateral", "$1,847"],
                  ["Borrowed", "$600"],
                ].map(([l, v]) => (
                  <div
                    key={l}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "5px 0",
                      borderBottom: "1px dotted var(--ds-gray-alpha-300)",
                      fontSize: 12.5,
                      color: "var(--fg-muted)",
                    }}
                  >
                    <span>{l}</span>
                    <strong
                      style={{
                        color: "var(--fg)",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 500,
                      }}
                    >
                      {v}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </ShotFrame>
        </div>
      </div>
    </section>
  );
}

const btnPrimary: CSSProperties = {
  appearance: "none",
  border: 0,
  width: "100%",
  height: 36,
  background: "var(--fg)",
  color: "var(--bg)",
  borderRadius: 8,
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: "-0.011em",
  cursor: "pointer",
};

function ShotFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--ds-gray-alpha-400)",
          borderRadius: 12,
          overflow: "hidden",
          height: 300,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: 32,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 12px",
            borderBottom: "1px solid var(--ds-gray-alpha-300)",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--ds-gray-alpha-400)",
            }}
          />
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--ds-gray-alpha-400)",
            }}
          />
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--ds-gray-alpha-400)",
            }}
          />
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--signal)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "var(--signal)",
              }}
            />
            Sui
          </span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--fg-muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {label}
      </span>
    </div>
  );
}
