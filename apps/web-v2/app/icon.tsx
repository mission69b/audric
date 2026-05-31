/**
 * Dynamic favicon — the AudricMark diamond rendered as a 32×32 PNG at
 * build time (Next.js metadata route). Monochrome white mark on a dark
 * rounded tile (fixed white-on-dark; a browser tab has no theme context).
 *
 * The mark uses the EXACT viewBox/offset/gap/cell constants from the
 * canonical `components/ui/audric-mark.tsx` (viewBox 512, offset 92,
 * gap 68, cell 56) so it's pixel-identical to the in-app mark and stays
 * perfectly centered: the cells span x/y 92 → 420 (92 + 4×68 + 56), so
 * the left padding is 92 and the right is 512 − 420 = 92 — symmetric. The
 * previous hand-tuned 100×100 rects sat ~7px low. No PNG is checked in.
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
        background: "#0a0a0a",
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg fill="#ffffff" height="24" viewBox="0 0 512 512" width="24">
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
