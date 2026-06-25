import { ImageResponse } from "next/og";

// PWA manifest icons — the AudricMark diamond (mirrors app/icon.tsx +
// app/apple-icon.tsx), rendered at the manifest-required sizes on demand.
// Query params: ?size=192|512 and &maskable=1 (adds OS safe-zone padding so the
// mark isn't clipped by Android's adaptive-icon mask).

const GRID: [number, number][] = [
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
const OFFSET = 92;
const GAP = 68;
const CELL = 56;

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get("size") === "192" ? 192 : 512;
  const maskable = searchParams.get("maskable") === "1";
  // Maskable icons must keep the mark inside the ~80% safe zone → pad more.
  const markPx = Math.round(size * (maskable ? 0.58 : 0.72));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#fafaf9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        fill="#0a0a0a"
        height={markPx}
        viewBox="92 92 328 328"
        width={markPx}
      >
        {GRID.map(([row, col]) => (
          <rect
            height={CELL}
            key={`${row}-${col}`}
            rx={8}
            ry={8}
            width={CELL}
            x={OFFSET + col * GAP}
            y={OFFSET + row * GAP}
          />
        ))}
      </svg>
    </div>,
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    }
  );
}
