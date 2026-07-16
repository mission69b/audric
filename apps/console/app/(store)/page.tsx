import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { ProjectIcon } from "@/components/project-icon";
import { fetchRetry } from "@/lib/fetch-retry";
import { loadProjectsFeed } from "@/lib/skills-feed";

// agents.t2000.ai — the DEVELOPER HOME (S.732 restructure, ratified
// 2026-07-16). Three-surface rule: t2000.ai SELLS, developers.t2000.ai
// EXPLAINS, this page is where you DO: install t2 code / connect your tool,
// mint a key, onboard an agent wallet — then rails to templates, skills,
// the directory, and the console. The skills shelf lives at /skills; the
// /templates rail earned its card 2026-07-16 (S.736: agent-worker · chat ·
// sui-dapp, all router-wired).
const API_BASE = "https://api.t2000.ai/v1";

const SETUP_PROMPT =
  "Read https://t2000.ai/skills/t2000-setup and follow the instructions to set up my agent's wallet and on-chain Agent ID.";

const INSTALL_CMD = "npm install -g @t2000/code && t2code";

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
  const skillCount = projects.reduce((n, p) => n + p.skills.length, 0);

  return (
    <>
      {/* Hero — the funnel: code privately, give your agent money. */}
      <section className="pt-6 pb-10">
        <div className="ag-eyebrow">{"// T2 AGENTS"}</div>
        <h1
          className="ag-title mt-3 max-w-[760px]"
          style={{ fontSize: "clamp(34px, 5vw, 56px)" }}
        >
          Build with private AI. Give your agent money.
        </h1>
        <p className="mt-4 max-w-[600px] text-[15px] text-muted-foreground leading-relaxed">
          A private coding agent. A wallet your agent owns. Free to start.
        </p>

        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          {/* Door 1 — the coding agent (bills the router). */}
          <div
            className="flex flex-col gap-3 rounded-xl border p-5"
            style={{ background: "#0d0d0d", borderColor: "var(--ag-border)" }}
          >
            <div className="font-mono text-[10.5px] text-fg-subtle uppercase tracking-[0.08em]">
              Code privately
            </div>
            <div className="flex items-center justify-between gap-3">
              <code className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-[12.5px] text-muted-foreground leading-relaxed">
                {INSTALL_CMD}
              </code>
              <CopyButton text={INSTALL_CMD} />
            </div>
            <p className="m-0 text-fg-subtle text-xs leading-relaxed">
              Open models, zero data retention.{" "}
              <a
                className="underline underline-offset-4 transition-colors hover:text-foreground"
                href="https://t2000.ai/code"
                rel="noreferrer"
                target="_blank"
              >
                Everything it does
              </a>{" "}
              ·{" "}
              <Link
                className="underline underline-offset-4 transition-colors hover:text-foreground"
                href="/manage"
              >
                Mint a key
              </Link>
            </p>
          </div>

          {/* Door 2 — the agent wallet (one paste, config-only). */}
          <div
            className="flex flex-col gap-3 rounded-xl border p-5"
            style={{ background: "#0d0d0d", borderColor: "var(--ag-border)" }}
          >
            <div className="font-mono text-[10.5px] text-fg-subtle uppercase tracking-[0.08em]">
              Give your agent a wallet
            </div>
            <div className="flex items-center justify-between gap-3">
              <code className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-[12.5px] text-muted-foreground leading-relaxed">
                {SETUP_PROMPT}
              </code>
              <CopyButton text={SETUP_PROMPT} />
            </div>
            <p className="m-0 text-fg-subtle text-xs leading-relaxed">
              Paste into any agent — it sets up its own wallet and Agent ID.{" "}
              <a
                className="underline underline-offset-4 transition-colors hover:text-foreground"
                href="https://developers.t2000.ai/use-from-your-agent"
                rel="noreferrer"
                target="_blank"
              >
                Per-client setup
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Rails — the rooms of the house. */}
      <section className="border-border/50 border-t pt-10 pb-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Templates (gallery lives on t2000.ai — the SELL surface). */}
          <a
            className="ag-card group flex flex-col gap-3 p-6 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30"
            href="https://t2000.ai/templates"
            rel="noreferrer"
            target="_blank"
          >
            <div className="ag-eyebrow">{"// TEMPLATES"}</div>
            <div className="font-semibold text-[19px] text-foreground tracking-[-0.02em]">
              Start a project
            </div>
            <p className="m-0 text-[12.5px] text-muted-foreground leading-relaxed">
              <span className="font-mono text-foreground">
                npm create t2-app@latest
              </span>{" "}
              — chat app, agent worker, Sui dApp.
            </p>
            <span className="mt-auto text-fg-subtle transition-transform group-hover:translate-x-0.5">
              Browse →
            </span>
          </a>

          {/* Skills shelf. */}
          <Link
            className="ag-card group flex flex-col gap-3 p-6 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30"
            href="/skills"
          >
            <div className="ag-eyebrow">{"// SKILLS"}</div>
            <div className="font-semibold text-[19px] text-foreground tracking-[-0.02em]">
              Teach it the chain
            </div>
            <p className="m-0 text-[12.5px] text-muted-foreground leading-relaxed">
              {skillCount} live playbooks — wallet, payments, paid APIs.
              One-paste install.
            </p>
            <div className="mt-auto flex items-center gap-2">
              <span className="flex items-center">
                {projects.slice(0, 5).map((p) => (
                  <span className="-mr-1.5" key={p.id}>
                    <ProjectIcon
                      accent={p.accent}
                      icon={p.icon}
                      name={p.name}
                      size={26}
                    />
                  </span>
                ))}
              </span>
              <span className="ml-3 text-fg-subtle transition-transform group-hover:translate-x-0.5">
                Browse →
              </span>
            </div>
          </Link>

          {/* Directory. */}
          <Link
            className="ag-card group flex flex-col gap-3 p-6 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30"
            href="/agents"
          >
            <div className="ag-eyebrow">{"// DIRECTORY"}</div>
            <div className="font-semibold text-[19px] text-foreground tracking-[-0.02em]">
              {total > 0 ? `${total} registered agents` : "The agent directory"}
            </div>
            <p className="m-0 text-[12.5px] text-muted-foreground leading-relaxed">
              Every agent with an on-chain Agent ID. Register free:{" "}
              <span className="font-mono">t2 init</span>.
            </p>
            <span className="mt-auto text-fg-subtle transition-transform group-hover:translate-x-0.5">
              Browse →
            </span>
          </Link>

          {/* Console. */}
          <Link
            className="ag-card group flex flex-col gap-3 p-6 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30"
            href="/manage"
          >
            <div className="ag-eyebrow">{"// CONSOLE"}</div>
            <div className="font-semibold text-[19px] text-foreground tracking-[-0.02em]">
              Keys, usage, billing
            </div>
            <p className="m-0 text-[12.5px] text-muted-foreground leading-relaxed">
              Sign in with Google — keys, top-up, usage per model.
            </p>
            <span className="mt-auto text-fg-subtle transition-transform group-hover:translate-x-0.5">
              Open →
            </span>
          </Link>
        </div>
      </section>
    </>
  );
}
