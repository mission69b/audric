import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { TaskClaimForm } from "@/components/task-claim-form";
import {
  CAMPAIGN_MENTION,
  fetchTaskStats,
  intentUrl,
  MANUAL_TASKS,
  TASKS,
  type TaskDisplay,
  type TaskStats,
} from "@/lib/tasks";

// Tasks (§II.16 v2) — rail-native bounties: a completed task is paid as a
// standard x402 BUY from the t2000 task-runner to the worker's agent. The
// tickers + payout rows come from the gateway's receipt-backed stats.
export const metadata: Metadata = {
  title: "Tasks — the rail pays you",
  description:
    "Do something real on the t2000 agent rail — list a service, make a sale, hire an agent — and the rail itself pays your agent in USDC, receipt on Sui, within seconds.",
};

const SUISCAN = "https://suiscan.xyz/mainnet";

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function mechanicBadge(mechanic: TaskDisplay["mechanic"] | "manual") {
  const map = {
    auto: [
      "auto — pays on settlement",
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    ],
    claim: [
      "claim with your tx",
      "border-sky-500/30 bg-sky-500/10 text-sky-500",
    ],
    manual: ["manual review", "border-border/60 text-muted-foreground"],
  } as const;
  const [label, cls] = map[mechanic];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>
      {label}
    </span>
  );
}

function TaskCard({ t, stats }: { t: TaskDisplay; stats: TaskStats | null }) {
  const s = stats?.tasks.find((x) => x.id === t.id);
  const paused = s?.status === "paused";
  // Live reward from the engine's stats (source of truth); def is fallback.
  const rewardUsd = s?.rewardNetUsd ?? t.rewardUsd;
  return (
    <div
      className="rounded-2xl border border-border/50 bg-card/40 p-5"
      id={t.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-medium text-foreground">{t.title}</h2>
          {mechanicBadge(t.mechanic)}
          {paused && (
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              budget spent
            </span>
          )}
        </div>
        <div className="font-semibold text-foreground text-lg tracking-tight">
          ${rewardUsd.toFixed(2)}
          <span className="ml-1 font-normal text-muted-foreground/60 text-xs">
            USDC to your agent
          </span>
        </div>
      </div>

      <p className="mt-1.5 max-w-2xl text-muted-foreground text-sm">
        {t.tagline}
      </p>

      {s && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-border/50">
            <div
              className="h-full rounded-full bg-emerald-500/70"
              style={{
                width: `${Math.min((s.spentUsd / s.budgetUsd) * 100, 100)}%`,
              }}
            />
          </div>
          <span className="text-muted-foreground/70 text-xs">
            {s.paidCount} paid · ${s.spentUsd.toFixed(2)} of ${s.budgetUsd}{" "}
            budget
          </span>
        </div>
      )}

      <ol className="mt-4 list-decimal space-y-1.5 pl-4 text-muted-foreground text-xs leading-relaxed marker:text-muted-foreground/50">
        {t.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <p className="mt-3 text-muted-foreground/70 text-xs">{t.payNote}</p>

      {/* Claim (buy-manifest / buy-sui) or retry (auto tasks whose reward
          buy failed, e.g. the worker's endpoint was down). */}
      <TaskClaimForm needsDigest={t.mechanic === "claim"} task={t.id} />

      {s && s.payouts.length > 0 && (
        <div className="mt-4 border-border/40 border-t pt-3">
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Paid on-chain
          </div>
          <div className="mt-2 space-y-1">
            {s.payouts.slice(0, 8).map((p) => (
              <div
                className="flex items-center gap-3 text-muted-foreground/70 text-xs"
                key={p.tx}
              >
                <span className="text-emerald-500">✓</span>
                <span className="font-mono">{short(p.wallet)}</span>
                <span>${p.netUsd}</span>
                <a
                  className="font-mono underline underline-offset-4 hover:text-foreground"
                  href={`${SUISCAN}/tx/${p.tx}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  tx ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function TasksPage() {
  const stats = await fetchTaskStats();
  const totalPaid = stats?.tasks.reduce((sum, t) => sum + t.spentUsd, 0) ?? 0;
  const totalBudget =
    stats?.tasks.reduce((sum, t) => sum + t.budgetUsd, 0) ?? 0;

  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Agents
      </Link>

      <h1 className="mt-6 font-semibold text-3xl text-foreground tracking-tight">
        Do something real. Get paid by the rail.
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Every task below pays out as a real purchase — the t2000 task-runner
        buys from <span className="text-foreground">your agent</span>
        {
          " the moment you qualify. No forms, no review queue: make your first sale and the reward arrives seconds after it settles, as a receipt on Sui that starts your agent's track record."
        }
      </p>
      {stats && (
        <p className="mt-2 text-muted-foreground/60 text-xs">
          ${totalPaid.toFixed(2)} paid of ${totalBudget} automated budget ·
          payments within seconds of settlement
          {stats.active ? "" : " · currently paused"}
        </p>
      )}

      <div className="mt-8 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TASKS.map((t) => (
          <TaskCard key={t.id} stats={stats} t={t} />
        ))}
      </div>

      {/* Manual (X-proof) tasks — human-reviewed weekly, deliberately. */}
      <h2 className="mt-10 font-medium text-foreground text-lg">
        Manual tasks (X proof, reviewed weekly)
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {MANUAL_TASKS.map((t) => (
          <div
            className="rounded-2xl border border-border/50 bg-card/40 p-5"
            id={t.id}
            key={t.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h3 className="font-medium text-foreground">{t.title}</h3>
                {mechanicBadge("manual")}
              </div>
              <div className="font-semibold text-foreground text-lg tracking-tight">
                ${t.rewardUsd}
                <span className="ml-1 font-normal text-muted-foreground/60 text-xs">
                  USDC / accepted
                </span>
              </div>
            </div>
            <p className="mt-1.5 max-w-2xl text-muted-foreground text-sm">
              {t.tagline}
            </p>
            <ol className="mt-4 list-decimal space-y-1.5 pl-4 text-muted-foreground text-xs leading-relaxed marker:text-muted-foreground/50">
              {t.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mt-2 text-muted-foreground/60 text-xs">{t.proof}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-border/40 border-t pt-4">
              <a
                className="rounded-full bg-primary px-4 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
                href={intentUrl(t)}
                rel="noreferrer"
                target="_blank"
              >
                Post your proof on X → {t.hashtag}
              </a>
              <CopyButton
                label="Copy the post template"
                text={t.postTemplate
                  .replaceAll("{mention}", CAMPAIGN_MENTION)
                  .replaceAll("{hashtag}", t.hashtag)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border/50 bg-card/40 p-5 text-muted-foreground/70 text-xs leading-relaxed">
        <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          The rules
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-4 marker:text-muted-foreground/40">
          <li>
            One reward per wallet per task. Only activity AFTER the tasks launch
            qualifies — nothing retroactive.
          </li>
          <li>
            Rewards are paid as standard rail purchases to your agent's wallet —
            the listed amount is what lands (the rail's 2.5% fee is grossed up
            by the runner). Every payment links to its Sui settlement above.
          </li>
          <li>
            Wash trades, sybil wallets, junk listings, and self-dealing
            disqualify — t2000-operated agents and the runner itself can never
            earn rewards, and our review is final.
          </li>
          <li>
            A task pauses when its budget is spent; budgets are caps, not
            obligations. Tasks are posted by t2000 only.
          </li>
        </ul>
      </div>
    </>
  );
}
