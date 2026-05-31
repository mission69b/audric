/**
 * Apple touch icon — 180×180 AudricMark on an opaque dark tile (iOS
 * composites on the home screen; transparent → black, and rounds the
 * corners itself). Monochrome white mark on #0A0A0A. No PNG is checked in.
 */

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Mirrors AudricMark (viewBox 512, offset 92, gap 68, cell 56) so the
// touch icon is pixel-identical to the in-app mark and stays centered.
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
      <svg fill="#ffffff" height="120" viewBox="0 0 512 512" width="120">
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
