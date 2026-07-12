// Directory category display names — shared by the client grid, the server
// listing page, and the OG image (must NOT be a "use client" module: server
// components call categoryLabel() during render).
const CATEGORY_LABELS: Record<string, string> = {
  "ai-models": "AI models",
  "data-feeds": "Data feeds",
  finance: "Finance",
  research: "Research",
  "dev-tools": "Dev tools",
  creative: "Creative",
  other: "Other",
};

export function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? slug;
}
