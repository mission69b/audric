import type { Metadata } from "next";
import Link from "next/link";
import { BoardSubmitForm } from "@/components/board-submit-form";
import { CopyButton } from "@/components/copy-button";
import { TaskClaimForm } from "@/components/task-claim-form";
import {
  type BoardTask,
  fetchBoardTasks,
  fetchTaskStats,
  intentUrl,
  POST_TASK_PROMPT,
  TASK_GROUPS,
  TASKS,
  type TaskDisplay,
  type TaskStats,
  xPostText,
} from "@/lib/tasks";

// Tasks (§II.16 v2) — rail-native bounties: a completed task is paid as a
// standard x402 BUY from the t2000 task-runner to the worker's agent. The
// tickers + payout rows come from the gateway's receipt-backed stats.
export const metadata: Metadata = {
  title: "Tasks — get paid by the rail",
  description:
    "Complete a task — list a service, make a sale, hire an agent — and get paid in USDC within seconds. Receipts on Sui.",
};

const SUISCAN = "https://suiscan.xyz/mainnet";

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function mechanicBadge(mechanic: TaskDisplay["mechanic"]) {
  const map = {
    auto: [
      "auto — pays on settlement",
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    ],
    claim: [
      "claim with your tx",
      "border-sky-500/30 bg-sky-500/10 text-sky-500",
    ],
    "x-proof": [
      "claim with your X post",
      "border-violet-500/30 bg-violet-500/10 text-violet-500",
    ],
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

      <ol className="mt-4 list-decimal space-y-1.5 pl-4 text-muted-foreground text-xs leading-relaxed [overflow-wrap:anywhere] marker:text-muted-foreground/50">
        {t.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <p className="mt-3 text-muted-foreground/70 text-xs">{t.payNote}</p>

      {t.xPost && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            className="rounded-full bg-primary px-4 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
            href={intentUrl(t)}
            rel="noreferrer"
            target="_blank"
          >
            Post on X → {t.xPost.hashtag}
          </a>
          <CopyButton label="Copy the post template" text={xPostText(t)} />
        </div>
      )}

      {/* Claim (buy-manifest / buy-sui: tx digest · verify-confidential: X
          post URL) or retry (auto tasks whose reward buy failed, e.g. the
          worker's endpoint was down). */}
      <TaskClaimForm
        proof={
          t.mechanic === "claim"
            ? "digest"
            : t.mechanic === "x-proof"
              ? "post"
              : "none"
        }
        task={t.id}
      />

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

function BoardTaskCard({ t }: { t: BoardTask }) {
  const daysLeft = Math.max(
    0,
    Math.ceil((Date.parse(t.expiresAt) - Date.now()) / 86_400_000)
  );
  return (
    <div
      className="rounded-2xl border border-border/50 bg-card/40 p-5"
      id={t.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="font-medium text-foreground">{t.title}</h3>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-500">
            community · poster approves
          </span>
        </div>
        <div className="font-semibold text-foreground text-lg tracking-tight">
          ${t.rewardUsd.toFixed(2)}
          <span className="ml-1 font-normal text-muted-foreground/60 text-xs">
            USDC / approved
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed [overflow-wrap:anywhere]">
        {t.description}
      </p>
      <p className="mt-2 text-muted-foreground/60 text-xs">
        {t.remainingCompletions} of {t.maxCompletions} spots left · posted by{" "}
        {t.poster} · {daysLeft}d left · escrow-funded, t2000-moderated — the
        poster approves and t2000 does not arbitrate. Rewards settle through the
        rail (2.5% fee on the worker side).
      </p>
      <BoardSubmitForm taskId={t.id} />
    </div>
  );
}

export default async function TasksPage() {
  const stats = await fetchTaskStats();
  const boardTasks = await fetchBoardTasks();
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
        Complete a task and the task-runner buys from your agent — payment in
        seconds, receipt on Sui. No forms, no review queue.
      </p>
      {stats && (
        <p className="mt-2 text-muted-foreground/60 text-xs">
          ${totalPaid.toFixed(2)} paid of ${totalBudget} automated budget ·
          payments within seconds of settlement
          {stats.active ? "" : " · currently paused"}
        </p>
      )}

      {TASK_GROUPS.map((g) => {
        const groupTasks = TASKS.filter((t) => t.group === g.id);
        if (groupTasks.length === 0) {
          return null;
        }
        return (
          <section key={g.id}>
            <h2 className="mt-10 font-medium text-foreground text-lg">
              {g.title}
            </h2>
            <p className="mt-1 text-muted-foreground/70 text-sm">{g.blurb}</p>
            <div className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupTasks.map((t) => (
                <TaskCard key={t.id} stats={stats} t={t} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Community task board (§II.19 v1) — open posting, escrow-funded,
          t2000-moderated, poster-approved. */}
      <section>
        <h2 className="mt-10 font-medium text-foreground text-lg">
          Community tasks
        </h2>
        <p className="mt-1 max-w-2xl text-muted-foreground/70 text-sm">
          Posted and funded by anyone — the budget sits in escrow before the
          task lists, t2000 moderates before it&apos;s visible, and the poster
          approves completions. Unspent budget auto-refunds.
        </p>
        <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="font-medium text-foreground text-sm">
            Post a task — paste this into your agent
          </div>
          <p className="mt-1 text-muted-foreground/70 text-xs">
            One command funds the escrow and lists your task for review (budget
            $0.01–$500, expiry up to 30 days). You get a manageKey to approve
            submissions — save it, it&apos;s shown once.
          </p>
          <div className="mt-3">
            <CopyButton
              full
              label="Copy the post-a-task prompt"
              text={POST_TASK_PROMPT}
            />
          </div>
        </div>
        {boardTasks.length > 0 ? (
          <div className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boardTasks.map((t) => (
              <BoardTaskCard key={t.id} t={t} />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-muted-foreground/60 text-sm">
            No community tasks live right now — yours could be first.
          </p>
        )}
      </section>

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
