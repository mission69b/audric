import { redirect } from "next/navigation";

// The hub home IS the skills directory (founder call, S.702 — one page, not
// two). /skills stays as a stable URL for external links (llms.txt, docs)
// and redirects home; per-project pages live on at /skills/[project].
export default function SkillsIndexPage() {
  redirect("/");
}
