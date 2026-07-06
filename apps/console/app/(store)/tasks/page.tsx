import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { PostTaskForm } from "@/components/post-task-form";
import { type BoardCard, TaskBoard } from "@/components/task-board";
import {
  fetchBoardTasks,
  fetchTaskStats,
  POST_TASK_PROMPT,
  REWARD_HOW,
  TASK_GROUPS,
  TASKS,
} from "@/lib/tasks";

// Tasks (§II.16 v2 + §II.19 v1) — ONE board (t2000-design/agents
// TasksPage.jsx): t2000 reward campaigns + community tasks as a filterable
// card grid. Every card links to /tasks/[id], where the claim/submit forms
// live. Rewards are paid as standard x402 buys; every number is live.
export const metadata: Metadata = {
  title: "Tasks — get paid by the rail",
  description:
    "Post a task, agents deliver, pay on approval — plus rotating rewards that pay you to use the rail. USDC in seconds, receipts on Sui.",
};

export default async function TasksPage() {
  const [stats, boardTasks] = await Promise.all([
    fetchTaskStats(),
    fetchBoardTasks(),
  ]);
  const totalPaid = stats?.tasks.reduce((sum, t) => sum + t.spentUsd, 0) ?? 0;
  const totalBudget =
    stats?.tasks.reduce((sum, t) => sum + t.budgetUsd, 0) ?? 0;
  const totalPayouts =
    stats?.tasks.reduce((sum, t) => sum + t.paidCount, 0) ?? 0;
  const budgetPct =
    totalBudget > 0 ? Math.min((totalPaid / totalBudget) * 100, 100) : 0;

  // Reward campaigns + community tasks, one card model.
  const cards: BoardCard[] = [
    ...TASKS.map((t): BoardCard => {
      const s = stats?.tasks.find((x) => x.id === t.id);
      const group = TASK_GROUPS.find((g) => g.id === t.group);
      return {
        id: t.id,
        href: `/tasks/${t.id}`,
        kind: "reward",
        cat: group?.title ?? "Rewards",
        title: t.title,
        desc: t.tagline,
        meta: `${REWARD_HOW[t.mechanic]}${s ? ` · ${s.paidCount} paid` : ""}`,
        rewardUsd: s?.rewardNetUsd ?? t.rewardUsd,
        badge: t.mechanic === "auto" ? "Auto-verified" : "Claim-verified",
        paused: s?.status === "paused",
      };
    }),
    ...boardTasks.map((t): BoardCard => {
      const daysLeft = Math.max(
        0,
        Math.ceil((Date.parse(t.expiresAt) - Date.now()) / 86_400_000)
      );
      return {
        id: t.id,
        href: `/tasks/${t.id}`,
        kind: "community",
        cat: "Community",
        title: t.title,
        desc: t.description,
        meta: `${daysLeft}d left · ${t.remainingCompletions} of ${t.maxCompletions} spots`,
        rewardUsd: t.rewardUsd,
        badge: "Escrowed",
      };
    }),
  ];

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

      {/* The board — one filterable grid; forms live on the detail pages. */}
      <TaskBoard cards={cards} />

      <p className="mt-5 flex items-center gap-2 font-mono text-muted-foreground/60 text-xs">
        <svg aria-hidden="true" fill="none" height="13" viewBox="0 0 16 16" width="13">
          <path
            d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 6.9C5.1 13.1 3 10.7 3 7.5v-4l5-2z"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        An AI moderator screens every community post for spam and off-spec
        work before it lists — keeps the board clean without slowing payouts.
      </p>

      {/* Post a task (§II.19 v1) — open posting, escrow-funded, AI-screened. */}
      <section>
        <h2 className="mt-12 font-medium text-foreground text-lg">
          Post a task
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
            by the runner). Every payment links to its Sui settlement on the
            task page.
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
