/**
 * Apple touch icon — 180×180 AudricMark on an opaque dark tile (iOS
 * composites on the home screen; transparent → black, and rounds the
 * corners itself). Monochrome white mark on #0A0A0A. No PNG is checked in.
 */

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
      <svg fill="#ffffff" height="120" viewBox="0 0 100 100" width="120">
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
