/**
 * Dynamic favicon — the AudricMark diamond rendered as a 32×32 PNG at
 * build time (Next.js metadata route). Monochrome white mark on a dark
 * rounded tile (fixed white-on-dark; a browser tab has no theme context).
 *
 * To change the mark, edit the rects here (mirrors the 9-cell GRID in
 * `components/ui/audric-mark.tsx`). No PNG is checked in.
 */

import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

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
      <svg fill="#ffffff" height="24" viewBox="0 0 100 100" width="24">
        <rect height="14" rx="2.8" width="14" x="42" y="14" />
        <rect height="14" rx="2.8" width="14" x="24" y="32" />
        <rect height="14" rx="2.8" width="14" x="60" y="32" />
        <rect height="14" rx="2.8" width="14" x="6" y="50" />
        <rect height="14" rx="2.8" width="14" x="42" y="50" />
        <rect height="14" rx="2.8" width="14" x="78" y="50" />
        <rect height="14" rx="2.8" width="14" x="24" y="68" />
        <rect height="14" rx="2.8" width="14" x="60" y="68" />
        <rect height="14" rx="2.8" width="14" x="42" y="86" />
      </svg>
    </div>,
    { ...size }
  );
}
