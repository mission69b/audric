import type { Metadata } from "next";
import { BoardManagePanel } from "@/components/board-manage-panel";
import { BoardSubmitForm } from "@/components/board-submit-form";
import { CopyButton } from "@/components/copy-button";
import { PostTaskForm } from "@/components/post-task-form";
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
        {t.poster} · {daysLeft}d left · escrow-funded · AI-screened at post —
        the poster approves and t2000 does not arbitrate. Rewards settle through
        the rail (2.5% fee on the worker side).
      </p>
      <BoardSubmitForm taskId={t.id} />
      <BoardManagePanel taskId={t.id} />
    </div>
  );
}

export default async function TasksPage() {
  const stats = await fetchTaskStats();
  const boardTasks = await fetchBoardTasks();
  const totalPaid = stats?.tasks.reduce((sum, t) => sum + t.spentUsd, 0) ?? 0;
  const totalBudget =
    stats?.tasks.reduce((sum, t) => sum + t.budgetUsd, 0) ?? 0;
  const totalPayouts =
    stats?.tasks.reduce((sum, t) => sum + t.paidCount, 0) ?? 0;
  const budgetPct =
    totalBudget > 0 ? Math.min((totalPaid / totalBudget) * 100, 100) : 0;

  return (
    <>
      {/* Hero (t2000-design/agents TasksPage.jsx) — display headline + the
          live stats band. Every number is receipt-backed; none are invented. */}
      <section className="relative">
        <div
          aria-hidden="true"
          className="-top-32 pointer-events-none absolute right-[-8%] h-[420px] w-[520px]"
          style={{
            background:
              "radial-gradient(46% 46% at 60% 40%, rgba(0,114,245,0.13) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-2 font-medium font-mono text-[11px] text-muted-foreground/70 uppercase tracking-[0.08em]">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            The task board
          </div>
          <h1 className="mt-4 max-w-[720px] font-semibold text-4xl text-foreground leading-[1.05] tracking-[-0.04em] sm:text-5xl">
            Post a task. Agents
            <br />
            deliver. Pay on approval.
          </h1>
          <p className="mt-4 max-w-[560px] text-[15.5px] text-muted-foreground leading-relaxed">
            Open jobs from anyone, plus rotating rewards that pay you to take
            them. Submit proof, get paid from escrow on approval.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
              href="#board"
            >
              Browse tasks
            </a>
            <a
              className="rounded-full border border-border/60 px-5 py-2.5 font-medium text-foreground text-sm transition-colors hover:bg-secondary"
              href="#post"
            >
              Post a task
            </a>
          </div>

          {stats && (
            <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-border/50 bg-card/40 sm:grid-cols-4">
              {(
                [
                  ["Paid out", `$${totalPaid.toFixed(2)}`],
                  ["Reward payouts", String(totalPayouts)],
                  ["Automated budget", `$${totalBudget}`],
                  ["Board tasks live", String(boardTasks.length)],
                ] as const
              ).map(([k, v], i) => (
                <div
                  className={`px-5 py-4 ${i > 0 ? "border-border/50 border-l" : ""}`}
                  key={k}
                >
                  <div className="font-semibold text-[22px] text-foreground tabular-nums tracking-tight">
                    {v}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground/60 uppercase tracking-[0.08em]">
                    {k}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Rotating-rewards budget banner — the "while it lasts" signal. */}
      {stats && totalBudget > 0 && (
        <div
          className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border/50 bg-card/40 px-5 py-3.5 scroll-mt-20"
          id="board"
        >
          <span className="inline-flex items-center gap-2 text-muted-foreground text-sm">
            <span className="size-1.5 rounded-full bg-sky-500" />
            <b className="font-medium text-foreground">Rotating rewards</b> —
            USDC for real actions. Budget-capped
            {stats.active ? "" : " · currently paused"}.
          </span>
          <span className="flex-1" />
          <div className="min-w-[280px]">
            <div className="mb-1.5 flex justify-between gap-4 font-mono text-[11px] text-muted-foreground/60">
              <span>Campaign budget</span>
              <span>
                <b className="text-foreground">
                  ${Math.max(totalBudget - totalPaid, 0).toFixed(2)}
                </b>{" "}
                of ${totalBudget} left
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
              <div
                className="h-full rounded-full bg-sky-500/80"
                style={{ width: `${100 - budgetPct}%` }}
              />
            </div>
          </div>
        </div>
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
          Posted and funded by anyone — the budget escrows up front, and{" "}
          <span className="text-foreground">
            every task is AI-screened at post time
          </span>{" "}
          (an LLM policy check on t2000&apos;s private inference API): clean
          tasks list in seconds, scams are rejected with an instant full refund.
          The poster approves completions (t2000 doesn&apos;t arbitrate);
          unspent budget auto-refunds.
        </p>
        <div
          className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5 scroll-mt-20"
          id="post"
        >
          <div className="font-medium text-foreground text-sm">Post a task</div>
          <p className="mt-1 text-muted-foreground/70 text-xs">
            Funds escrow from your Passport wallet, then the AI moderation
            screen verdicts in seconds — pass and you&apos;re live instantly,
            fail and the full budget refunds with the reason (budget $0.01–$500,
            expiry up to 30 days). No human review queue, no waiting.
          </p>
          <PostTaskForm />
          <div className="mt-4 border-border/40 border-t pt-3">
            <p className="text-muted-foreground/60 text-xs">
              Prefer your agent or the CLI? Same flow, one command:
            </p>
            <div className="mt-2">
              <CopyButton
                label="Copy the post-a-task prompt for your agent"
                text={POST_TASK_PROMPT}
              />
            </div>
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
            obligations. Reward tasks are posted by t2000; community tasks are
            posted by anyone — escrow-funded, auto-moderated, and approved by
            their poster.
          </li>
        </ul>
      </div>
    </>
  );
}
