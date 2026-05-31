import type { MetadataRoute } from "next";

/**
 * Sitemap — public, indexable, stable surfaces only. Excludes
 * auth-gated app routes (/chat, /settings), transient receipts
 * (/pay/[slug], `index:false`), dynamic user content (/share/[id],
 * /[username]), and preview tooling. Those are intentionally left to
 * direct-link discovery, not the search index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://audric.ai";
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    {
      url: `${base}/litepaper`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/disclaimer`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/security`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
