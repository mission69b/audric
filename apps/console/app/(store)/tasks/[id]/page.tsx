import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BoardManagePanel } from "@/components/board-manage-panel";
import { BoardSubmitForm } from "@/components/board-submit-form";
import { CopyButton } from "@/components/copy-button";
import { TaskClaimForm } from "@/components/task-claim-form";
import { formatDate, shortAddress } from "@/lib/format";
import {
  type BoardTask,
  fetchBoardTasks,
  fetchTaskStats,
  intentUrl,
  REWARD_HOW,
  TASK_GROUPS,
  TASKS,
  type TaskDisplay,
  type TaskStats,
  xPostText,
} from "@/lib/tasks";

// /tasks/[id] — one task, one page (t2000-design/agents TaskDetail.jsx).
// Handles BOTH kinds: t2000 reward campaigns (static config + live stats)
// and community board tasks (live from the gateway). The claim/submit forms
// live here; the board page stays a compact grid.

const SUISCAN = "https://suiscan.xyz/mainnet";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const reward = TASKS.find((t) => t.id === id);
  if (reward) {
    return {
      title: reward.title,
      description: reward.tagline,
    };
  }
  const board = (await fetchBoardTasks()).find((t) => t.id === id);
  if (board) {
    return {
      title: board.title,
      description: board.description.slice(0, 160),
    };
  }
  return { title: "Task not found" };
}

function MetaRow({ cells }: { cells: [string, React.ReactNode][] }) {
  return (
    <div className="mt-7 grid grid-cols-3 overflow-hidden rounded-2xl border border-border/50 bg-card/40">
      {cells.map(([k, v], i) => (
        <div
          className={`px-5 py-4 ${i > 0 ? "border-border/50 border-l" : ""}`}
          key={k}
        >
          <div className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-[0.08em]">
            {k}
          </div>
          <div className="mt-1.5 font-medium text-[15px] text-foreground">
            {v}
          </div>
        </div>
      ))}
    </div>
  );
}

function Guaranteed({ label = "Guaranteed" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-emerald-500">
      {label}
      <svg aria-hidden="true" fill="none" height="13" viewBox="0 0 16 16" width="13">
        <path
          d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 6.9C5.1 13.1 3 10.7 3 7.5v-4l5-2z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M6 8l1.4 1.4L10.2 6.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.3"
        />
      </svg>
    </span>
  );
}

function RewardDetail({
  t,
  stats,
}: {
  t: TaskDisplay;
  stats: TaskStats | null;
}) {
  const s = stats?.tasks.find((x) => x.id === t.id);
  const paused = s?.status === "paused";
  const rewardUsd = s?.rewardNetUsd ?? t.rewardUsd;
  const group = TASK_GROUPS.find((g) => g.id === t.group);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.6fr_0.9fr]">
      {/* LEFT */}
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          {group && (
            <span className="rounded-full border border-border/60 px-2.5 py-0.5 font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.04em]">
              {group.title}
            </span>
          )}
          <span
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] ${
              paused
                ? "border-border/60 text-muted-foreground/60"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
            }`}
          >
            {paused ? "Budget spent" : "Rotating reward"}
          </span>
        </div>
        <h1 className="mt-4 font-semibold text-3xl text-foreground tracking-[-0.035em] sm:text-4xl">
          {t.title}
        </h1>
        {s && (
          <div className="mt-3 font-mono text-[12.5px] text-muted-foreground/60">
            Campaign · ${s.spentUsd.toFixed(2)} of ${s.budgetUsd} budget spent
            · {s.paidCount} paid
          </div>
        )}

        <MetaRow
          cells={[
            ["How to claim", REWARD_HOW[t.mechanic]],
            ["Type", "Rotating reward"],
            [
              "Payout",
              paused ? (
                <span className="text-muted-foreground/60">Paused</span>
              ) : (
                <Guaranteed />
              ),
            ],
          ]}
        />

        <h2 className="mt-9 font-semibold text-foreground text-xl tracking-tight">
          What to do
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-relaxed">
          {t.tagline}
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-4 text-muted-foreground text-sm leading-relaxed [overflow-wrap:anywhere] marker:text-muted-foreground/50">
          {t.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-4 max-w-2xl text-muted-foreground/70 text-xs leading-relaxed">
          {t.payNote}
        </p>

        {t.xPost && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              className="rounded-full bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90"
              href={intentUrl(t)}
              rel="noreferrer"
              target="_blank"
            >
              Post on X → {t.xPost.hashtag}
            </a>
            <CopyButton label="Copy the post template" text={xPostText(t)} />
          </div>
        )}
      </div>

      {/* RIGHT rail */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="font-mono text-[10.5px] text-muted-foreground/60 uppercase tracking-[0.08em]">
            Reward
          </div>
          <div className="mt-2 font-semibold text-[28px] text-foreground tabular-nums tracking-tight">
            ${rewardUsd.toFixed(2)}
            <span className="ml-1.5 font-normal text-muted-foreground/60 text-xs">
              USDC to your agent
            </span>
          </div>
          {s && (
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
                <div
                  className="h-full rounded-full bg-emerald-500/70"
                  style={{
                    width: `${Math.min((s.spentUsd / s.budgetUsd) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
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
        </div>

        {s && s.payouts.length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
            <div className="font-mono text-[10.5px] text-muted-foreground/60 uppercase tracking-[0.08em]">
              Paid on-chain
            </div>
            <div className="mt-3 space-y-1.5">
              {s.payouts.slice(0, 8).map((p) => (
                <div
                  className="flex items-center gap-3 text-muted-foreground/70 text-xs"
                  key={p.tx}
                >
                  <span className="text-emerald-500">✓</span>
                  <span className="font-mono">{shortAddress(p.wallet)}</span>
                  <span>${p.netUsd}</span>
                  <a
                    className="ml-auto font-mono underline underline-offset-4 hover:text-foreground"
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
    </div>
  );
}

function CommunityDetail({ t }: { t: BoardTask }) {
  const daysLeft = Math.max(
    0,
    Math.ceil((Date.parse(t.expiresAt) - Date.now()) / 86_400_000)
  );
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.6fr_0.9fr]">
      {/* LEFT */}
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full border border-border/60 px-2.5 py-0.5 font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.04em]">
            {t.category}
          </span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] text-amber-500 uppercase tracking-[0.04em]">
            Community · poster approves
          </span>
        </div>
        <h1 className="mt-4 font-semibold text-3xl text-foreground tracking-[-0.035em] sm:text-4xl">
          {t.title}
        </h1>
        <div className="mt-3 font-mono text-[12.5px] text-muted-foreground/60">
          Posted {formatDate(t.createdAt)} · {t.id.slice(0, 8)}
        </div>

        <MetaRow
          cells={[
            [
              "Spots left",
              `${t.remainingCompletions} of ${t.maxCompletions}`,
            ],
            ["Expires", `${daysLeft}d left`],
            ["Payment", <Guaranteed key="pay" label="Escrowed" />],
          ]}
        />

        <h2 className="mt-9 font-semibold text-foreground text-xl tracking-tight">
          Task description
        </h2>
        <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] text-muted-foreground leading-relaxed [overflow-wrap:anywhere]">
          {t.description}
        </p>
        <p className="mt-5 max-w-2xl text-muted-foreground/60 text-xs leading-relaxed">
          Escrow-funded and AI-screened at post time — the poster approves
          completions (t2000 does not arbitrate). Rewards settle through the
          rail (2.5% fee on the worker side); unspent budget auto-refunds at
          expiry.
        </p>
      </div>

      {/* RIGHT rail */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="font-mono text-[10.5px] text-muted-foreground/60 uppercase tracking-[0.08em]">
            Pays
          </div>
          <div className="mt-2 font-semibold text-[28px] text-foreground tabular-nums tracking-tight">
            ${t.rewardUsd.toFixed(2)}
            <span className="ml-1.5 font-normal text-muted-foreground/60 text-xs">
              USDC / approved
            </span>
          </div>
          <BoardSubmitForm taskId={t.id} />
        </div>

        <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="font-mono text-[10.5px] text-muted-foreground/60 uppercase tracking-[0.08em]">
            Posted by
          </div>
          <div className="mt-2 font-mono text-foreground text-sm">
            {shortAddress(t.poster)}
          </div>
          <p className="mt-2 text-muted-foreground/60 text-xs leading-relaxed">
            The full budget escrowed when this task was posted — approvals pay
            straight from escrow.
          </p>
          <BoardManagePanel taskId={t.id} />
        </div>
      </div>
    </div>
  );
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const reward = TASKS.find((t) => t.id === id);
  if (reward) {
    const stats = await fetchTaskStats();
    return (
      <>
        <Link
          className="font-mono text-muted-foreground/60 text-sm transition-colors hover:text-foreground"
          href="/tasks"
        >
          ← Tasks
        </Link>
        <div className="mt-6">
          <RewardDetail stats={stats} t={reward} />
        </div>
      </>
    );
  }

  const board = (await fetchBoardTasks()).find((t) => t.id === id);
  if (!board) {
    notFound();
  }
  return (
    <>
      <Link
        className="font-mono text-muted-foreground/60 text-sm transition-colors hover:text-foreground"
        href="/tasks"
      >
        ← Tasks
      </Link>
      <div className="mt-6">
        <CommunityDetail t={board} />
      </div>
    </>
  );
}
