import { getCurrentUser } from "@audric/auth/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PosterTaskReview } from "@/components/poster-task-review";
import { listMyBoardTasks, type PosterTask } from "@/lib/board-poster";

const OPEN_STATUSES = new Set(["live", "pending_review"]);

function TaskCard({ t }: { t: PosterTask }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-medium text-foreground">{t.title}</div>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          {t.status.replace(/_/g, " ")}
        </span>
      </div>
      <p className="mt-1 text-muted-foreground/70 text-xs">
        ${t.rewardUsd.toFixed(2)} × {t.maxCompletions} · $
        {t.spentUsd.toFixed(2)} of ${t.budgetUsd.toFixed(2)} spent ·{" "}
        {t.approvedCount} paid · expires{" "}
        {new Date(t.expiresAt).toLocaleDateString()}
      </p>
      <PosterTaskReview task={t} />
    </div>
  );
}

function PostedTaskList({ tasks }: { tasks: PosterTask[] }) {
  const open = tasks.filter((t) => OPEN_STATUSES.has(t.status));
  // Closed/expired/rejected stay reviewable (payout + refund txs live in
  // their submissions) but out of the way — the ledger is the keepsake.
  const finished = tasks.filter((t) => !OPEN_STATUSES.has(t.status));

  return (
    <div className="mt-6 space-y-4">
      {open.length === 0 && (
        <p className="text-muted-foreground/70 text-sm">
          No open tasks right now.
        </p>
      )}
      {open.map((t) => (
        <TaskCard key={t.id} t={t} />
      ))}
      {finished.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-muted-foreground/60 text-xs underline underline-offset-4 hover:text-foreground">
            Show finished ({finished.length}) — closed, expired, rejected
          </summary>
          <div className="mt-3 space-y-4 opacity-75">
            {finished.map((t) => (
              <TaskCard key={t.id} t={t} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// /manage/tasks — session-native board management (S.626.2): the tasks this
// Passport wallet posted, with full submissions and one-click batch payouts.
// No manageKey — the session IS the credential (the escrow payment came from
// this wallet; the gateway verifies poster == wallet on every action).
export const metadata: Metadata = { title: "Posted tasks" };
export const dynamic = "force-dynamic";

export default async function PostedTasksPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const result = await listMyBoardTasks();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-semibold text-2xl text-foreground tracking-tight">
        Posted tasks
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Community tasks funded by this wallet. Approve pays the worker through
        the rail instantly; unspent budget auto-refunds at expiry.
      </p>

      {result.ok ? (
        result.tasks.length === 0 ? (
          <p className="mt-6 text-muted-foreground/70 text-sm">
            Nothing posted yet —{" "}
            <Link
              className="underline underline-offset-4 hover:text-foreground"
              href="https://agents.t2000.ai/tasks"
            >
              post your first task
            </Link>{" "}
            (funds escrow from this wallet, lists instantly after the moderation
            screen).
          </p>
        ) : (
          <PostedTaskList tasks={result.tasks} />
        )
      ) : (
        <p className="mt-6 text-muted-foreground/70 text-sm">{result.error}</p>
      )}
    </div>
  );
}
