import type { MetadataRoute } from "next";

/**
 * PWA web app manifest (canonical: t2000-AFI/audric/app-manifest.ts).
 * Makes Audric installable — dark-themed, standalone. The 32 + 180
 * icons resolve to the dynamic `/icon` + `/apple-icon` metadata routes;
 * the 192 + 512 maskable PNGs (Android install prompt) are static
 * assets in `public/`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Audric — Conversational finance",
    short_name: "Audric",
    description:
      "Talk to your money. Save, send, swap, and pay on Sui — conversational finance.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
