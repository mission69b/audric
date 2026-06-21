/**
 * Favicon — the AudricMark diamond as a 32×32 PNG (Next.js metadata route).
 * Dark mark on an off-white tile (the brand mark). Canonical geometry
 * (offset 92 / gap 68 / cell 56), but the viewBox is CROPPED to the diamond's
 * exact bounds (92→420 = 328) so the mark FILLS the tile and stays legible at a
 * real 16px tab — the full-512 viewBox left it a tiny speck.
 */

import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Mirrors AudricMark: [row, col] of the 9-cell diamond.
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

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#fafaf9",
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg fill="#0a0a0a" height="26" viewBox="92 92 328 328" width="26">
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
