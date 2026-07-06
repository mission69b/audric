"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type PosterTask, reviewBoardSubmissions } from "@/lib/board-poster";

// Session-native submission review (S.626.2) — no manageKey anywhere: the
// server action attests the signed-in Passport wallet to the gateway.
export function PosterTaskReview({ task }: { task: PosterTask }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const pendingSubs = task.submissions.filter((s) => s.status === "pending");

  function act(action: "approve" | "reject") {
    startTransition(async () => {
      const result = await reviewBoardSubmissions({
        taskId: task.id,
        submissionIds: [...selected],
        action,
      });
      setMessage(result.message);
      setSelected(new Set());
      router.refresh();
    });
  }

  if (task.submissions.length === 0) {
    return (
      <p className="mt-3 text-muted-foreground/60 text-xs">
        No submissions yet — share the task to get workers on it.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {task.submissions.map((s) => (
          <label
            className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/40 p-2 text-xs"
            key={s.id}
          >
            <input
              checked={selected.has(s.id)}
              className="mt-0.5"
              disabled={s.status !== "pending"}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) {
                  next.add(s.id);
                } else {
                  next.delete(s.id);
                }
                setSelected(next);
              }}
              type="checkbox"
            />
            <span className="min-w-0 flex-1">
              <span className="font-mono text-muted-foreground">
                {s.worker.slice(0, 10)}… ·{" "}
                <span
                  className={
                    s.status === "paid"
                      ? "text-emerald-500"
                      : s.status === "rejected"
                        ? "text-destructive"
                        : "text-foreground"
                  }
                >
                  {s.status}
                </span>
              </span>
              <span className="mt-0.5 block text-foreground [overflow-wrap:anywhere]">
                {s.proof}
              </span>
              {s.url && (
                <a
                  className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  href={s.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  proof link ↗
                </a>
              )}
              {s.payoutDigest && (
                <a
                  className="ml-2 font-mono text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  href={`https://suiscan.xyz/mainnet/tx/${s.payoutDigest}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  payout tx ↗
                </a>
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          className="text-muted-foreground/70 text-xs underline underline-offset-4 hover:text-foreground"
          onClick={() => setSelected(new Set(pendingSubs.map((s) => s.id)))}
          type="button"
        >
          Select all pending ({pendingSubs.length})
        </button>
        <button
          className="ag-btn ag-btn--primary ag-btn--sm disabled:opacity-50"
          disabled={pending || selected.size === 0}
          onClick={() => act("approve")}
          type="button"
        >
          {pending ? "Paying…" : `Approve & pay (${selected.size})`}
        </button>
        <button
          className="ag-btn ag-btn--ghost ag-btn--sm disabled:opacity-50"
          disabled={pending || selected.size === 0}
          onClick={() => act("reject")}
          type="button"
        >
          Reject ({selected.size})
        </button>
        {message && (
          <span className="text-muted-foreground text-xs">{message}</span>
        )}
      </div>
    </div>
  );
}
