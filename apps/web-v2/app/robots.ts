import type { MetadataRoute } from "next";

/**
 * robots.txt. Public marketing + legal + the `/[username]` profile
 * surfaces are crawlable; everything app-side, transactional, or
 * private is disallowed:
 *   - /api/*            — not a page surface
 *   - /chat, /settings  — auth-gated app
 *   - /auth/*           — zkLogin callback plumbing
 *   - /dev, /*-preview  — internal preview tooling
 *   - /pay/*            — transient receipts, already `robots: index:false`
 *   - /share/*          — public-by-link chats, not meant for the index
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/chat",
        "/settings",
        "/auth/",
        "/dev",
        "/pay/",
        "/share/",
        "/canvas-preview",
        "/tooltip-preview",
      ],
    },
    sitemap: "https://audric.ai/sitemap.xml",
    host: "https://audric.ai",
  };
}
