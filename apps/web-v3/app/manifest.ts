import type { MetadataRoute } from "next";

// PWA manifest (Phase 0 — installable mobile web). Next serves this at
// /manifest.webmanifest and auto-injects <link rel="manifest">. Icons are
// rendered on demand by app/pwa-icon (the AudricMark), sized + maskable-padded
// per request, so there are no static binary assets to maintain.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Audric — Private, decentralized AI",
    short_name: "Audric",
    description:
      "Multi-model AI with a non-custodial wallet. Own your data, your memory, and your money.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon?size=512&maskable=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
