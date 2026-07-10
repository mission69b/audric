import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { PROJECTS_FEED } from "@/lib/skills-feed";

// /skills — the skills directory index: one card per PROJECT (the Portal
// Monad-directory pattern), each linking to its /skills/[project] page.
export const metadata: Metadata = {
  title: "Skills",
  description:
    "Agent skills for Sui — live markdown playbooks your agent reads and follows. One page per project.",
};

const SETUP_PROMPT =
  "Read https://t2000.ai/skills/t2000-setup and follow the instructions to set up my agent's wallet and on-chain Agent ID.";

export default function SkillsIndexPage() {
  return (
    <>
      <section className="pt-6 pb-8">
        <div className="ag-eyebrow">{"// SKILLS"}</div>
        <h1
          className="ag-title mt-3 max-w-[720px]"
          style={{ fontSize: "clamp(30px, 4.5vw, 48px)" }}
        >
          Teach your agent the chain.
        </h1>
        <p className="mt-4 max-w-[560px] text-[15px] text-muted-foreground leading-relaxed">
          Skills are live markdown playbooks an agent reads and follows —
          onboarding is one paste per skill. Grouped by project; every entry is
          read + smoke-tested before it ships here.
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
          Start here — the setup skill gives the agent a wallet + Agent ID;
          every other skill assumes it.
        </p>
      </section>

      <section className="border-border/50 border-t pt-8">
        <div className="grid gap-4 md:grid-cols-2">
          {PROJECTS_FEED.map((project) => (
            <Link
              className="ag-card flex flex-col gap-2 p-5 no-underline transition-colors hover:border-foreground/30"
              href={`/skills/${project.id}`}
              key={project.id}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-[18px] text-foreground tracking-[-0.02em]">
                  {project.name}
                </span>
                <span className="font-mono text-[11px] text-fg-subtle">
                  {project.skills.length} skill
                  {project.skills.length === 1 ? "" : "s"} →
                </span>
              </div>
              <p className="m-0 text-[13px] text-muted-foreground leading-relaxed">
                {project.tagline}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {project.skills.slice(0, 5).map((s) => (
                  <span
                    className="rounded-full border border-border/50 px-2 py-0.5 font-mono text-[10px] text-fg-subtle"
                    key={s.slug}
                  >
                    {s.name}
                  </span>
                ))}
                {project.skills.length > 5 && (
                  <span className="px-1 py-0.5 font-mono text-[10px] text-fg-subtle">
                    +{project.skills.length - 5} more
                  </span>
                )}
              </div>
            </Link>
          ))}
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
              SKILL.md playbooks that teach agents to use your dapp. PR them to
              the skills repo — merged projects get their own page here.
            </p>
          </a>
        </div>
      </section>
    </>
  );
}
