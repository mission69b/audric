import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://audric.ai';
  const now = new Date();

  return [
    { url: `${base}/`,           lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/litepaper`,  lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${base}/disclaimer`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/privacy`,    lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/security`,   lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/terms`,      lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
