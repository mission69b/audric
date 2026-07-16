import { redirect } from "next/navigation";

// The template gallery moved to the SELL surface (t2000.ai/templates) in the
// 2026-07-16 Vercel-shape consolidation — agents.t2000.ai stays the DO
// surface. Permanent redirect keeps day-one links alive.
export default function TemplatesRedirect() {
  redirect("https://t2000.ai/templates");
}
