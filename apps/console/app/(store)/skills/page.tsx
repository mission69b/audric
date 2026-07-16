import Link from "next/link";
import { ProjectIcon } from "@/components/project-icon";
import { loadProjectsFeed } from "@/lib/skills-feed";

// agents.t2000.ai/skills — the skills shelf (moved off the homepage in the
// S.732 developer-home restructure; / is now the funnel, this is the shelf).
// Rail-first framing per the S.730 rethink: this shelf teaches agents to
// TRANSACT; build-on-Sui skills are Mysten's, everything else is skills.sh.

export const metadata = {
  title: "Skills — t2 Agents",
  description:
    "Live playbooks that teach agents to transact on the t2000 rail — wallet, gasless USDC, x402 paid APIs, on-chain Agent ID.",
};

export default async function SkillsPage() {
  const projects = await loadProjectsFeed();
  const skillCount = projects.reduce((n, p) => n + p.skills.length, 0);

  return (
    <section className="pt-6 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="ag-eyebrow">{"// SKILLS"}</div>
          <h1
            className="ag-title mt-2"
            style={{ fontSize: "clamp(28px, 4vw, 44px)" }}
          >
            Teach it the chain.
          </h1>
          <p className="mt-3 max-w-[560px] text-[14px] text-muted-foreground leading-relaxed">
            {skillCount} live playbooks, served as plain markdown. Copy a card’s
            prompt into your agent — or install the whole shelf:{" "}
            <code className="font-mono text-foreground">
              npx skills add mission69b/t2000-skills
            </code>
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <Link
            className="ag-card group flex flex-col gap-3 p-5 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30"
            href={`/skills/${project.id}`}
            key={project.id}
          >
            <div className="flex items-center gap-3.5">
              <ProjectIcon
                accent={project.accent}
                icon={project.icon}
                name={project.name}
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[17px] text-foreground tracking-[-0.02em]">
                  {project.name}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-fg-subtle">
                  {`${project.skills.length} skill${project.skills.length === 1 ? "" : "s"}`}
                </div>
              </div>
              <span className="text-fg-subtle transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </div>
            <p className="m-0 text-[12.5px] text-muted-foreground leading-relaxed">
              {project.tagline}
            </p>
            <div className="mt-auto flex flex-wrap gap-1.5">
              {[...new Set(project.skills.flatMap((s) => s.tags))]
                .slice(0, 4)
                .map((tag) => (
                  <span
                    className="rounded-full border border-border/50 px-2 py-0.5 font-mono text-[10px] text-fg-subtle"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
            </div>
          </Link>
        ))}
        {/* The enabler loop — third parties PR their dapp's skill. */}
        <a
          className="flex flex-col justify-center gap-2 rounded-2xl border border-border/50 border-dashed p-5 no-underline transition-colors hover:border-foreground/40"
          href="https://github.com/mission69b/t2000-skills"
          rel="noreferrer"
          target="_blank"
        >
          <div className="font-mono text-[10.5px] text-fg-subtle uppercase tracking-[0.08em]">
            Your project
          </div>
          <div className="font-semibold text-[16px] text-foreground tracking-[-0.016em]">
            Add skills for your protocol →
          </div>
          <p className="m-0 text-[13px] text-muted-foreground leading-relaxed">
            PR a SKILL.md + a feed.json entry + your mark to the skills repo —
            merged projects appear here with their own page, no deploy.
          </p>
        </a>
      </div>

      {/* The ecosystem, not a mirror: this shelf is the money/identity
            rail; build-on-Sui skills are Mysten's, everything else lives on
            skills.sh. We link out instead of duplicating (S.729 rethink). */}
      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5"
        style={{ background: "#0d0d0d", borderColor: "var(--ag-border)" }}
      >
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] text-fg-subtle uppercase tracking-[0.08em]">
            Building on Sui?
          </div>
          <p className="m-0 mt-1.5 max-w-[560px] text-[12.5px] text-muted-foreground leading-relaxed">
            This shelf teaches agents to <em>transact</em> — wallet, identity,
            payments. To <em>build</em> (Move, PTBs, object model, dApp Kit),
            install the official Sui Agent Skills by Mysten Labs:{" "}
            <code className="font-mono text-foreground">
              npx skills add mystenlabs/skills --all
            </code>
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[12px]">
          <a
            className="text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            href="https://docs.sui.io/skills"
            rel="noreferrer"
            target="_blank"
          >
            docs.sui.io/skills ↗
          </a>
          <a
            className="text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            href="https://www.skills.sh"
            rel="noreferrer"
            target="_blank"
          >
            skills.sh ↗
          </a>
        </div>
      </div>
    </section>
  );
}
