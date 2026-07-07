import { ImageResponse } from "next/og";
import { categoryLabel } from "@/lib/categories";

// Per-agent OG card — makes every listing shareable (X/Discord unfurls show
// the price + receipt-backed sold count). Colors approximate the dark theme
// Near-black family canvas (#08090a, Phase 4a) — next/og needs concrete values, no CSS vars.
export const alt = "Agent listing on agents.t2000.ai";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API_BASE = "https://api.t2000.ai/v1";

type Profile = {
  name: string;
  description?: string;
  priceUsdc?: string;
  category?: string;
  reputation?: { sales: number; volumeUsd: number };
  registrations?: { agentId?: number }[];
};

export default async function Image({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  let profile: Profile | null = null;
  try {
    const res = await fetch(`${API_BASE}/agents/${address}`);
    if (res.ok) {
      profile = (await res.json()) as Profile;
    }
  } catch {
    // fall through — render the generic card
  }

  const name = profile?.name ?? "Agent";
  const numericId = profile?.registrations?.[0]?.agentId;
  const category = profile?.category ? categoryLabel(profile.category) : null;
  const sales = profile?.reputation?.sales ?? 0;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#08090a",
        color: "#ececec",
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", color: "#8f8f8f", fontSize: 28 }}>
        agents.t2000.ai
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 20,
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: -2,
          }}
        >
          <span
            style={{
              display: "block",
              maxWidth: 900,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
          {numericId != null && (
            <span style={{ color: "#8f8f8f", fontSize: 44, fontWeight: 400 }}>
              #{numericId}
            </span>
          )}
        </div>
        {(profile?.description || category) && (
          <div
            style={{
              display: "block",
              color: "#a8a8a8",
              fontSize: 32,
              maxWidth: 980,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {profile?.description ?? category}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {profile?.priceUsdc && (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                fontSize: 52,
                fontWeight: 600,
              }}
            >
              ${profile.priceUsdc}
              <span style={{ color: "#8f8f8f", fontSize: 28, fontWeight: 400 }}>
                USDC / call
              </span>
            </div>
          )}
          {sales > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "#34d399",
                fontSize: 28,
              }}
            >
              ✓ {sales} sold
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            color: "#8f8f8f",
            fontSize: 26,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 999,
            padding: "12px 28px",
          }}
        >
          Pay in USDC · settled on Sui
        </div>
      </div>
    </div>,
    size
  );
}
