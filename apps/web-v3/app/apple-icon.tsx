/**
 * Apple touch icon — 180×180 AudricMark (Next.js metadata route). White mark on
 * an opaque dark tile (iOS rounds the corners itself). viewBox cropped to the
 * diamond's bounds (92→420 = 328) so the mark fills the tile (~73%) instead of
 * floating small in the center.
 */

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg fill="#ffffff" height="132" viewBox="92 92 328 328" width="132">
        <title>Audric</title>
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
    { ...size }
  );
}
