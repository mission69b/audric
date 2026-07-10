import { getUsernamesByIds } from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import { CopyButton } from "@/components/copy-button";
import { fetchRetry } from "@/lib/fetch-retry";
import { PROJECTS_FEED } from "@/lib/skills-feed";

// agents.t2000.ai — the Agent Hub (SPEC_HUB_V1). Two shelves:
//   1. SKILLS — live markdown playbooks an agent reads to act on Sui,
//      grouped by PROJECT (one card per protocol; one-paste per skill).
//   2. DIRECTORY — every registered Agent ID (identity-only), reading the
//      public /v1/agents JSON.
const API_BASE = "https://api.t2000.ai/v1";

const SETUP_PROMPT =
  "Read https://t2000.ai/skills/t2000-setup and follow the instructions to set up my agent's wallet and on-chain Agent ID.";

type AgentRow = {
  address: string;
  numericId?: number | null;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
};

async function fetchAgents(): Promise<{ total: number; agents: AgentRow[] }> {
  try {
    const res = await fetchRetry(`${API_BASE}/agents?limit=100&offset=0`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        total?: number;
        agents?: AgentRow[];
      };
      return { total: data.total ?? 0, agents: data.agents ?? [] };
    }
  } catch {
    // directory unavailable — render the skills shelf alone
  }
  return { total: 0, agents: [] };
}

export default async function HubPage() {
  const { total, agents } = await fetchAgents();
  const handles = await getUsernamesByIds(agents.map((a) => a.address)).catch(
    () => new Map<string, string>()
  );
  const rows = agents;

  return (
    <>
      {/* Hero — the enabler one-liner. */}
      <section className="pt-6 pb-10">
        <div className="ag-eyebrow">{"// THE AGENT HUB FOR SUI"}</div>
        <h1
          className="ag-title mt-3 max-w-[720px]"
          style={{ fontSize: "clamp(34px, 5vw, 56px)" }}
        >
          Give your agent skills on Sui.
        </h1>
        <p className="mt-4 max-w-[560px] text-[15px] text-muted-foreground leading-relaxed">
          A wallet it owns, an on-chain identity, and skills that teach it to
          act — swap, send, pay APIs per call. Each skill is a markdown playbook
          your agent reads and follows. Onboarding is one paste.
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
          commands. Config-only; it never moves funds.
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
            into your agent — it reads the skill and follows it.
          </p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PROJECTS_FEED.map((project) => (
            <Link
              className="ag-card flex flex-col gap-2 p-5 no-underline transition-colors hover:border-foreground/30"
              href={`/skills/${project.id}`}
              key={project.id}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-[17px] text-foreground tracking-[-0.02em]">
                  {project.name}
                </span>
                <span className="font-mono text-[11px] text-fg-subtle">
                  {project.skills.length} skill
                  {project.skills.length === 1 ? "" : "s"} →
                </span>
              </div>
              <p className="m-0 text-[12.5px] text-muted-foreground leading-relaxed">
                {project.tagline}
              </p>
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
              SKILL.md playbooks that teach agents to use your dapp. PR them to
              the skills repo — merged projects get their own page.
            </p>
          </a>
        </div>
        <div className="mt-4">
          <Link
            className="font-mono text-[12px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            href="/skills"
          >
            Browse all skills →
          </Link>
        </div>
      </section>

      {/* Directory. */}
      <section className="mt-10 border-border/50 border-t pt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ag-eyebrow">{"// DIRECTORY"}</div>
            <h2
              className="ag-title mt-2"
              style={{ fontSize: "clamp(24px, 3vw, 34px)" }}
            >
              {total > 0 ? `${total} registered agents.` : "Registered agents."}
            </h2>
          </div>
          <p className="m-0 max-w-[380px] text-fg-subtle text-xs leading-relaxed">
            Every agent with an on-chain Agent ID — name, wallet, owner link,
            live status. Register free:{" "}
            <span className="font-mono">t2 init</span> — or{" "}
            <Link
              className="underline underline-offset-4"
              href="/manage/create"
            >
              create one in the console
            </Link>
            .
          </p>
        </div>
        <div className="ag-card mt-5 divide-y divide-border/50 overflow-hidden">
          {rows.slice(0, 40).map((a) => {
            const handle = handles.get(a.address);
            return (
              <Link
                className="flex items-center gap-4 px-4 py-3.5 no-underline transition-colors hover:bg-[color:var(--ag-overlay)]"
                href={`/${a.numericId ?? a.address}`}
                key={a.address}
              >
                <AgentAvatar
                  address={a.address}
                  imageUrl={a.imageUrl ?? undefined}
                  name={a.name}
                  size={34}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-[14px] text-foreground">
                      {a.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                      {handle ? `${displayHandle(handle)} · ` : ""}#
                      {a.numericId ?? "—"}
                    </span>
                  </div>
                  {a.description && (
                    <div className="mt-0.5 truncate text-[12.5px] text-fg-muted">
                      {a.description.split("\n")[0]}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-fg-subtle">→</span>
              </Link>
            );
          })}
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-fg-subtle text-sm">
              Directory temporarily unavailable.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
