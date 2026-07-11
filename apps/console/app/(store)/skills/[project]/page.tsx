import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { ProjectIcon } from "@/components/project-icon";
import { formatDate } from "@/lib/format";
import { getProject, PROJECTS_FALLBACK, skillPrompt } from "@/lib/skills-feed";

// /skills/[project] — one project's skill page (the Portal Monad-directory
// pattern: agents.portalhq.io/monad/skills/uniswap-labs). Every skill row:
// name · tags · description · last-verified · view skill.md · copy prompt.
export function generateStaticParams() {
  return PROJECTS_FALLBACK.map((p) => ({ project: p.id }));
}

// Feed-added projects (merged PRs) get pages without a console deploy.
export const dynamicParams = true;
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ project: string }>;
}): Promise<Metadata> {
  const { project: id } = await params;
  const project = await getProject(id);
  if (!project) {
    return { title: "Skills" };
  }
  return {
    title: `${project.name} skills`,
    description: `${project.skills.length} agent-readable skills for ${project.name} — ${project.tagline}`,
  };
}

export default async function ProjectSkillsPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project: id } = await params;
  const project = await getProject(id);
  if (!project) {
    notFound();
  }

  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← t2 Agents
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <ProjectIcon
            accent={project.accent}
            icon={project.icon}
            name={project.name}
            size={64}
          />
          <div>
            <h1
              className="ag-title"
              style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
            >
              {project.name}
            </h1>
            <div className="mt-1.5 font-mono text-[13px] text-fg-subtle">
              <a
                className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                href={project.url}
                rel="noreferrer"
                target="_blank"
              >
                {project.url.replace("https://", "")}
              </a>{" "}
              · {project.skills.length} skill
              {project.skills.length === 1 ? "" : "s"} indexed
            </div>
          </div>
        </div>
        <p className="m-0 max-w-[340px] text-fg-subtle text-xs leading-relaxed">
          {project.tagline}
        </p>
      </div>

      <div className="mt-8 grid gap-4">
        {project.skills.map((s) => (
          <div className="ag-card p-5" key={s.slug}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-semibold text-[16px] text-foreground tracking-[-0.016em]">
                  {s.name}
                </span>
                <span className="ag-verified px-2 py-0.5 text-[10px]">
                  active
                </span>
              </div>
              <div className="flex items-center gap-2">
                {s.tags.map((t) => (
                  <span
                    className="rounded-full border border-border/50 px-2 py-0.5 font-mono text-[10px] text-fg-subtle"
                    key={t}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-2 mb-0 max-w-[640px] text-[13.5px] text-muted-foreground leading-relaxed">
              {s.description}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-[12.5px] text-foreground">
                  Paste into your agent
                </div>
                <CopyButton text={skillPrompt(s)} />
              </div>
              <code
                className="block overflow-x-auto whitespace-pre-wrap rounded-[10px] border p-3 font-mono text-[11.5px] text-muted-foreground leading-relaxed"
                style={{
                  background: "#0d0d0d",
                  borderColor: "var(--ag-border)",
                }}
              >
                {skillPrompt(s)}
              </code>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10.5px] text-fg-subtle">
                Last verified {formatDate(project.lastVerified)}
              </span>
              <a
                className="font-mono text-[11.5px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                href={s.skillUrl}
                rel="noreferrer"
                target="_blank"
              >
                View skill.md ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
