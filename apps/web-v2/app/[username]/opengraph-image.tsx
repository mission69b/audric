import { ImageResponse } from "next/og";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";

/**
 * Per-username Twitter / Open Graph card (Phase 6 Session 3 port from
 * `audric/apps/web/app/[username]/opengraph-image.tsx`).
 *
 * When a user shares their `audric.ai/<handle>` URL on X (or any platform
 * that reads OG meta), the social platform fetches THIS route to render
 * the inline preview card. The site-wide root opengraph-image.tsx would
 * otherwise be used — generic Audric branding, no handle context.
 *
 * Validation strategy: format + reserved-list ONLY (no SuiNS RPC).
 *   - The image is a pure function of the URL param.
 *   - SuiNS RPC at the OG-image edge has no retry budget — a flaky
 *     lookup would render a generic fallback for a valid handle, which
 *     is a worse outcome than a "preview-without-on-chain-check" image
 *     for a handle that doesn't exist (the linked page itself still
 *     404s correctly via its own RPC check).
 *   - Performance — X retries aggressively if the image takes >2-3s.
 *
 * Reserved + invalid handles fall back to the generic Audric card so
 * shares of `audric.ai/admin` or `audric.ai/-bad` don't render
 * authoritative-looking handle cards.
 *
 * Cross-app imports: `validateAudricLabel` + `isReserved` are cross-app
 * imported from `apps/web/lib/identity/*` (same pattern as Session 2's
 * username modals; single source of truth in apps/web until v0.7e).
 */

export const runtime = "edge";
export const alt = "Audric Passport";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PARENT_SUFFIX = "@audric";

const DIAMOND: [number, number][] = [
  [0, 2],
  [1, 1],
  [1, 3],
  [2, 0],
  [2, 2],
  [2, 4],
  [3, 1],
  [3, 3],
  [4, 2],
];

interface ImageProps {
  params: Promise<{ username: string }>;
}

export default async function Image({ params }: ImageProps) {
  const { username } = await params;
  const validation = validateAudricLabel(username);
  const isValidHandle = validation.valid && !isReserved(validation.label);
  const label = isValidHandle ? validation.label : null;
  const fullHandle = label ? `${label}${PARENT_SUFFIX}` : null;

  const [instrumentSerif, departureMono] = await Promise.all([
    fetch(new URL("../fonts/InstrumentSerif-Regular.ttf", import.meta.url))
      .then((res) => res.arrayBuffer())
      .catch(() => null),
    fetch(new URL("../fonts/DepartureMono-Regular.otf", import.meta.url))
      .then((res) => res.arrayBuffer())
      .catch(() => null),
  ]);

  let heroSize: number;
  if (!fullHandle) {
    heroSize = 88;
  } else if (fullHandle.length <= 18) {
    heroSize = 84;
  } else if (fullHandle.length <= 22) {
    heroSize = 72;
  } else if (fullHandle.length <= 26) {
    heroSize = 60;
  } else {
    heroSize = 50;
  }

  const cellSize = 24;
  const gap = 7;
  const gridTotal = 5 * cellSize + 4 * gap;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#191919",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -55%)",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.04), transparent 70%)",
        }}
      />

      <div
        style={{
          display: "flex",
          color: "#5c8a5c",
          fontSize: 16,
          fontFamily: departureMono ? "Departure Mono" : "monospace",
          letterSpacing: "0.16em",
          marginBottom: 56,
        }}
      >
        ▓▒░&nbsp;&nbsp;YOUR PASSPORT&nbsp;&nbsp;░▒▓
      </div>

      {fullHandle ? (
        <div
          style={{
            display: "flex",
            maxWidth: 1080,
            fontFamily: instrumentSerif ? "Instrument Serif" : "Georgia",
            fontSize: heroSize,
            color: "#ffffff",
            letterSpacing: "-0.01em",
            lineHeight: 1.05,
            textAlign: "center",
            wordBreak: "break-all",
          }}
        >
          {fullHandle}
        </div>
      ) : (
        <>
          <div
            style={{
              position: "relative",
              width: gridTotal,
              height: gridTotal,
              display: "flex",
              flexWrap: "wrap",
              marginBottom: 28,
            }}
          >
            {DIAMOND.map(([row, col]) => (
              <div
                key={`${row}-${col}`}
                style={{
                  position: "absolute",
                  left: col * (cellSize + gap),
                  top: row * (cellSize + gap),
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 4,
                  background: "#ffffff",
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              fontFamily: instrumentSerif ? "Instrument Serif" : "Georgia",
              fontSize: heroSize,
            }}
          >
            <span style={{ color: "#ffffff" }}>Audr</span>
            <span style={{ color: "#555555" }}>\</span>
            <span style={{ color: "#ffffff" }}>c</span>
          </div>
        </>
      )}

      <div
        style={{
          color: "#9a9a9a",
          fontSize: 18,
          fontFamily: "Georgia",
          fontStyle: "italic",
          marginTop: 36,
          textAlign: "center",
        }}
      >
        {fullHandle
          ? "Yours on Sui — recognized everywhere"
          : "Your money, handled."}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 32,
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "#707070",
          fontSize: 14,
          fontFamily: departureMono ? "Departure Mono" : "monospace",
          letterSpacing: "0.05em",
        }}
      >
        <span style={{ color: "#a8a8a8" }}>🪪</span>
        <span>{label ? `audric.ai/${label}` : "audric.ai"}</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        ...(instrumentSerif
          ? [
              {
                name: "Instrument Serif",
                data: instrumentSerif,
                style: "normal" as const,
                weight: 400 as const,
              },
            ]
          : []),
        ...(departureMono
          ? [
              {
                name: "Departure Mono",
                data: departureMono,
                style: "normal" as const,
                weight: 400 as const,
              },
            ]
          : []),
      ],
    }
  );
}
