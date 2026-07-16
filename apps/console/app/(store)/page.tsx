import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { ProjectIcon } from "@/components/project-icon";
import { fetchRetry } from "@/lib/fetch-retry";
import { loadProjectsFeed } from "@/lib/skills-feed";

// agents.t2000.ai — t2 Agents (SPEC_HUB_V1). Skills-first home: the one-paste
// hero + the skills shelf. The directory lives at /agents (S.703).
const API_BASE = "https://api.t2000.ai/v1";

const SETUP_PROMPT =
  "Read https://t2000.ai/skills/t2000-setup and follow the instructions to set up my agent's wallet and on-chain Agent ID.";

async function fetchAgentCount(): Promise<number> {
  try {
    const res = await fetchRetry(`${API_BASE}/agents?limit=1`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = (await res.json()) as { total?: number };
      return data.total ?? 0;
    }
  } catch {
    // directory unavailable — the teaser renders without a count
  }
  return 0;
}

export default async function HubPage() {
  const [total, projects] = await Promise.all([
    fetchAgentCount(),
    loadProjectsFeed(),
  ]);

  return (
    <>
      {/* Hero — the enabler one-liner. */}
      <section className="pt-6 pb-10">
        <div className="ag-eyebrow">{"// T2 AGENTS"}</div>
        <h1
          className="ag-title mt-3 max-w-[720px]"
          style={{ fontSize: "clamp(34px, 5vw, 56px)" }}
        >
          Give your agent skills on Sui.
        </h1>
        <p className="mt-4 max-w-[560px] text-[15px] text-muted-foreground leading-relaxed">
          A wallet it owns, an on-chain identity, and skills that teach it to
          act — swap, send, pay APIs per call. Onboarding is one paste.
        </p>
        <div
          className="mt-6 flex max-w-[680px] items-center justify-between gap-3 rounded-xl border p-4"
          style={{ background: "#0d0d0d", borderColor: "var(--ag-border)" }}
        >
          <code className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-[12.5px] text-muted-foreground leading-relaxed">
            {SETUP_PROMPT}
          </code>
          <CopyButton text={SETUP_PROMPT} />
        </div>
        <p className="mt-2 text-fg-subtle text-xs">
          Paste into Claude Code, Cursor, Codex — any agent that can run
          commands. Config-only; it never moves funds. Per-client setup:{" "}
          <a
            className="underline underline-offset-4 transition-colors hover:text-foreground"
            href="https://developers.t2000.ai/use-from-your-agent"
            rel="noreferrer"
            target="_blank"
          >
            Audric · Claude Code · Cursor · Codex
          </a>
          .
        </p>
      </section>

      {/* Skills shelf. */}
      <section className="border-border/50 border-t pt-10 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ag-eyebrow">{"// SKILLS"}</div>
            <h2
              className="ag-title mt-2"
              style={{ fontSize: "clamp(24px, 3vw, 34px)" }}
            >
              Teach it the chain.
            </h2>
          </div>
          <p className="m-0 max-w-[340px] text-fg-subtle text-xs leading-relaxed">
            Live playbooks, served as plain markdown. Copy a card&apos;s prompt
            into your agent — or install the whole shelf:{" "}
            <code className="font-mono text-foreground">
              npx skills add mission69b/t2000-skills
            </code>
          </p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                    {project.skills.length} skill
                    {project.skills.length === 1 ? "" : "s"}
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

      {/* Directory teaser — the list lives at /agents. */}
      <section className="mt-10 border-border/50 border-t pt-10 pb-4">
        <Link
          className="ag-card group flex flex-wrap items-center justify-between gap-4 p-6 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30"
          href="/agents"
        >
          <div>
            <div className="ag-eyebrow">{"// DIRECTORY"}</div>
            <div className="mt-2 font-semibold text-[19px] text-foreground tracking-[-0.02em]">
              {total > 0 ? `${total} registered agents` : "The agent directory"}
            </div>
            <p className="m-0 mt-1 max-w-[480px] text-[12.5px] text-muted-foreground leading-relaxed">
              Every agent with an on-chain Agent ID. Register free:{" "}
              <span className="font-mono">t2 init</span>.
            </p>
          </div>
          <span className="text-fg-subtle transition-transform group-hover:translate-x-0.5">
            Browse →
          </span>
        </Link>
      </section>
    </>
  );
}
