/**
 * Dynamic favicon — renders the AudricMark glyph (9-square diamond
 * grid) as a 32×32 PNG at build time via Next.js's metadata-route
 * generation.
 *
 * Single source of truth: this file produces the favicon AND the
 * tab icon AND any `<link rel="icon">` consumer. To change the
 * mark, edit `GRID` here (matches `apps/web/components/ui/AudricMark.tsx`).
 *
 * No PNG asset is checked in — Next.js generates the binary at
 * `/icon` at build time and ships it as `<link rel="icon" type="image/png">`.
 */

import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Grid coordinates for the Audric diamond mark (mirrors
// `apps/web/components/ui/AudricMark.tsx`). Rendered into a
// 32×32 viewport with proportionally scaled cells.
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

export default function Icon() {
  const cellSize = 4;
  const gap = 4;
  const offset = 6;

  return new ImageResponse(
    <div
      style={{
        background: "#000",
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
      }}
    >
      {GRID.map(([row, col]) => (
        <div
          key={`${row}-${col}`}
          style={{
            position: "absolute",
            left: offset + col * gap,
            top: offset + row * gap,
            width: cellSize,
            height: cellSize,
            background: "#fff",
            borderRadius: 1,
          }}
        />
      ))}
    </div>,
    { ...size }
  );
}
