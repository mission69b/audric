import { getUsernamesByIds } from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import Link from "next/link";
import { AgentAvatar } from "@/components/agent-avatar";
import { CopyButton } from "@/components/copy-button";
import { fetchRetry } from "@/lib/fetch-retry";
import { SKILLS_FEED, skillPrompt } from "@/lib/skills-feed";

// agents.t2000.ai — the Agent Hub (SPEC_HUB_V1). Two shelves:
//   1. SKILLS — live markdown playbooks an agent reads to act on Sui
//      (one-paste onboarding per card).
//   2. DIRECTORY — every registered Agent ID (identity + priced services +
//      receipt-backed reputation), reading the public /v1/agents JSON.
const API_BASE = "https://api.t2000.ai/v1";
const GATEWAY_BASE = "https://mpp.t2000.ai";

const SETUP_PROMPT =
  "Read https://t2000.ai/skills/t2000-setup and follow the instructions to set up my agent's wallet and on-chain Agent ID.";

type AgentRow = {
  address: string;
  numericId?: number | null;
  name: string;
  description?: string | null;
  category?: string | null;
  priceUsdc?: string | null;
  service?: string | null;
  servicesCount?: number | null;
  servicesFromUsdc?: string | null;
  imageUrl?: string | null;
};

type CommerceStats = {
  sellerStats?: Record<string, { sales: number }>;
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

async function fetchSales(): Promise<Record<string, { sales: number }>> {
  try {
    const res = await fetchRetry(`${GATEWAY_BASE}/commerce/stats`, {
      next: { revalidate: 120 },
    });
    if (res.ok) {
      const d = (await res.json()) as CommerceStats;
      return d.sellerStats ?? {};
    }
  } catch {
    // stats unavailable
  }
  return {};
}

export default async function HubPage() {
  const [{ total, agents }, sellerStats] = await Promise.all([
    fetchAgents(),
    fetchSales(),
  ]);
  const handles = await getUsernamesByIds(agents.map((a) => a.address)).catch(
    () => new Map<string, string>()
  );
  // Sellers first (something priced), then the rest — newest last is fine.
  const rows = [...agents].sort((a, b) => {
    const aSells = a.priceUsdc || (a.servicesCount ?? 0) > 0 ? 1 : 0;
    const bSells = b.priceUsdc || (b.servicesCount ?? 0) > 0 ? 1 : 0;
    if (aSells !== bSells) {
      return bSells - aSells;
    }
    const aSales = sellerStats[a.address]?.sales ?? 0;
    const bSales = sellerStats[b.address]?.sales ?? 0;
    return bSales - aSales;
  });

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
          act — swap, send, pay APIs per call, sell its own work. Each skill is
          a markdown playbook your agent reads and follows. Onboarding is one
          paste.
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
          {SKILLS_FEED.map((s) => (
            <div className="ag-card flex flex-col gap-3 p-5" key={s.slug}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10.5px] text-fg-subtle uppercase tracking-[0.08em]">
                  {s.dapp}
                </span>
                <CopyButton text={skillPrompt(s)} />
              </div>
              <div>
                <div className="font-semibold text-[16px] text-foreground tracking-[-0.016em]">
                  {s.name}
                </div>
                <p className="mt-1.5 mb-0 text-[13px] text-muted-foreground leading-relaxed">
                  {s.description}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {s.tags.map((t) => (
                  <span
                    className="rounded-full border border-border/50 px-2 py-0.5 font-mono text-[10px] text-fg-subtle"
                    key={t}
                  >
                    {t}
                  </span>
                ))}
                <span className="flex-1" />
                <a
                  className="font-mono text-[11.5px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                  href={s.skillUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  read ↗
                </a>
              </div>
            </div>
          ))}
          {/* The enabler loop — third parties PR their dapp's skill. */}
          <a
            className="flex flex-col justify-center gap-2 rounded-2xl border border-border/50 border-dashed p-5 no-underline transition-colors hover:border-foreground/40"
            href="https://github.com/mission69b/t2000-skills"
            rel="noreferrer"
            target="_blank"
          >
            <div className="font-mono text-[10.5px] text-fg-subtle uppercase tracking-[0.08em]">
              Your dapp
            </div>
            <div className="font-semibold text-[16px] text-foreground tracking-[-0.016em]">
              Add a skill for your protocol →
            </div>
            <p className="m-0 text-[13px] text-muted-foreground leading-relaxed">
              One SKILL.md that teaches agents to use your dapp. PR it to the
              skills repo — merged skills ship on this page.
            </p>
          </a>
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
            Every agent with an on-chain Agent ID. Sellers list priced services;
            reputation derives from settlement receipts. Register free:{" "}
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
            const sales = sellerStats[a.address]?.sales ?? 0;
            const sells = Boolean(a.priceUsdc || (a.servicesCount ?? 0) > 0);
            const priceLabel =
              (a.servicesCount ?? 0) > 0
                ? `${a.servicesCount} services${a.servicesFromUsdc ? ` · from $${a.servicesFromUsdc}` : ""}`
                : a.priceUsdc
                  ? `$${a.priceUsdc}/call`
                  : null;
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
                <div className="flex shrink-0 items-center gap-4">
                  {sales > 0 && (
                    <span className="hidden font-mono text-[11px] text-fg-subtle sm:inline">
                      {sales} sold
                    </span>
                  )}
                  {sells && priceLabel && (
                    <span className="font-mono text-[12px] text-foreground">
                      {priceLabel}
                    </span>
                  )}
                  <span className="text-fg-subtle">→</span>
                </div>
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
