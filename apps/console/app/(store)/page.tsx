import Link from "next/link";
import { ProjectIcon } from "@/components/project-icon";
import { fetchRetry } from "@/lib/fetch-retry";
import { loadProjectsFeed } from "@/lib/skills-feed";

// agents.t2000.ai — the DO surface, kept simple (founder direction
// 2026-07-16 evening: "nice pretty landing page (simple)"). Five tiles —
// Directory · Console · Private Inference · Sell your API · Skills — and
// nothing else. No t2 code door (t2000.ai/code sells it), no wallet-paste
// block (developers.t2000.ai explains it). Consolidation v2 (console.t2000.ai
// + agents→gateway) is BANKED in SPEC_INFERENCE_DEMAND, not built.
const API_BASE = "https://api.t2000.ai/v1";

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
    // directory unavailable — the tile renders without a count
  }
  return 0;
}

interface Tile {
  cta: string;
  desc: React.ReactNode;
  external?: boolean;
  eyebrow: string;
  href: string;
  title: string;
}

export default async function HubPage() {
  const [total, projects] = await Promise.all([
    fetchAgentCount(),
    loadProjectsFeed(),
  ]);
  const skillCount = projects.reduce((n, p) => n + p.skills.length, 0);

  const tiles: Tile[] = [
    {
      eyebrow: "// DIRECTORY",
      title: total > 0 ? `${total} registered agents` : "The agent directory",
      desc: (
        <>
          Every agent with an on-chain Agent ID. Register free:{" "}
          <span className="font-mono">t2 init</span>.
        </>
      ),
      href: "/agents",
      cta: "Browse →",
    },
    {
      eyebrow: "// CONSOLE",
      title: "Keys, usage, billing",
      desc: "Sign in with Google — API keys, top-up, usage per model.",
      href: "/manage",
      cta: "Open →",
    },
    {
      eyebrow: "// PRIVATE INFERENCE",
      title: "Every model, one key",
      desc: (
        <>
          <span className="font-mono text-foreground">t2000/auto</span> — open
          and frontier models, zero data retention.
        </>
      ),
      href: "https://t2000.ai/private-inference",
      external: true,
      cta: "How it works →",
    },
    {
      eyebrow: "// SELL YOUR API",
      title: "Charge USDC per call",
      desc: "List your x402 endpoint on your agent's profile — live-probed, gasless, paid straight to your wallet.",
      href: "https://developers.t2000.ai/sell-your-api",
      external: true,
      cta: "Start selling →",
    },
    {
      eyebrow: "// SKILLS",
      title: "Teach it the chain",
      desc: `${skillCount} live playbooks — wallet, payments, paid APIs. One-paste install.`,
      href: "/skills",
      cta: "Browse →",
    },
  ];

  return (
    <>
      <section className="pt-10 pb-12">
        <div className="ag-eyebrow">{"// T2 AGENTS"}</div>
        <h1
          className="ag-title mt-3 max-w-[680px]"
          style={{ fontSize: "clamp(34px, 5vw, 56px)" }}
        >
          The home for agents on Sui.
        </h1>
        <p className="mt-4 max-w-[520px] text-[15px] text-muted-foreground leading-relaxed">
          An on-chain identity, a console for keys and billing, and a way to get
          paid.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <Link
            className="rounded-lg bg-foreground px-4 py-2 font-medium text-[13.5px] text-background no-underline transition-opacity hover:opacity-90"
            href="/manage"
          >
            Open the console
          </Link>
          <Link
            className="rounded-lg border px-4 py-2 font-medium text-[13.5px] text-muted-foreground no-underline transition-colors hover:text-foreground"
            href="/agents"
            style={{ borderColor: "var(--ag-border)" }}
          >
            Browse the directory
          </Link>
        </div>
      </section>

      <section className="border-border/50 border-t pt-10 pb-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => {
            const inner = (
              <>
                <div className="ag-eyebrow">{tile.eyebrow}</div>
                <div className="font-semibold text-[19px] text-foreground tracking-[-0.02em]">
                  {tile.title}
                </div>
                <p className="m-0 text-[12.5px] text-muted-foreground leading-relaxed">
                  {tile.desc}
                </p>
                {tile.eyebrow === "// SKILLS" && (
                  <span className="flex items-center">
                    {projects.slice(0, 5).map((p) => (
                      <span className="-mr-1.5" key={p.id}>
                        <ProjectIcon
                          accent={p.accent}
                          icon={p.icon}
                          name={p.name}
                          size={24}
                        />
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-auto text-fg-subtle transition-transform group-hover:translate-x-0.5">
                  {tile.cta}
                </span>
              </>
            );
            const className =
              "ag-card group flex flex-col gap-3 p-6 no-underline transition-all hover:-translate-y-0.5 hover:border-foreground/30";
            return tile.external ? (
              <a
                className={className}
                href={tile.href}
                key={tile.eyebrow}
                rel="noreferrer"
                target="_blank"
              >
                {inner}
              </a>
            ) : (
              <Link className={className} href={tile.href} key={tile.eyebrow}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
