"use server";

import { getCurrentUser } from "@audric/auth/server";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";

// Session-native board management (S.626.2). The gateway can't verify
// zkLogin signatures, but THIS server can (Passport session cookie) — so it
// attests the signed-in wallet over the shared proxy secret and the gateway
// scopes everything to tasks that wallet's escrow paid for. No manageKey in
// the browser flow.

const PROXY_URL = "https://mpp.t2000.ai/tasks/board/poster";

export type PosterSubmission = {
  id: string;
  worker: string;
  proof: string;
  url: string | null;
  status: string;
  at: string;
  payoutDigest?: string | null;
};

export type PosterTask = {
  id: string;
  title: string;
  description: string;
  rewardUsd: number;
  maxCompletions: number;
  approvedCount: number;
  remainingCompletions: number;
  status: string;
  createdAt: string;
  expiresAt: string;
  budgetUsd: number;
  spentUsd: number;
  submissions: PosterSubmission[];
};

export async function listMyBoardTasks(): Promise<
  { ok: true; tasks: PosterTask[] } | { ok: false; error: string }
> {
  const session = await getCurrentUser();
  if (!session) {
    return { ok: false, error: "Sign in first." };
  }
  if (!env.BOARD_POSTER_PROXY_KEY) {
    return { ok: false, error: "Task management is not configured." };
  }
  try {
    const res = await fetch(
      `${PROXY_URL}?address=${encodeURIComponent(session.user.id)}`,
      {
        headers: { "x-board-poster-proxy": env.BOARD_POSTER_PROXY_KEY },
        cache: "no-store",
      }
    );
    const json = (await res.json()) as { tasks?: PosterTask[]; error?: string };
    if (!res.ok) {
      return { ok: false, error: json.error ?? "Could not load your tasks." };
    }
    return { ok: true, tasks: json.tasks ?? [] };
  } catch {
    return { ok: false, error: "Gateway unreachable — try again." };
  }
}

export async function reviewBoardSubmissions(input: {
  taskId: string;
  submissionIds: string[];
  action: "approve" | "reject";
}): Promise<{ ok: boolean; paid?: number; message: string }> {
  const session = await getCurrentUser();
  if (!session) {
    return { ok: false, message: "Sign in first." };
  }
  if (!env.BOARD_POSTER_PROXY_KEY) {
    return { ok: false, message: "Task management is not configured." };
  }
  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-board-poster-proxy": env.BOARD_POSTER_PROXY_KEY,
      },
      body: JSON.stringify({
        poster: session.user.id,
        taskId: input.taskId,
        submissionIds: input.submissionIds,
        action: input.action,
      }),
    });
    const json = (await res.json()) as {
      paid?: number;
      results?: { error?: string }[];
      error?: string;
    };
    if (!(res.ok && json.results)) {
      return { ok: false, message: json.error ?? "Review failed." };
    }
    const errors = json.results.filter(
      (r) => r.error && r.error !== "already handled"
    );
    revalidatePath("/manage/tasks");
    return {
      ok: errors.length === 0,
      paid: json.paid,
      message:
        input.action === "approve"
          ? `Paid ${json.paid ?? 0} of ${input.submissionIds.length}${errors.length > 0 ? ` — ${errors.length} failed (${errors[0].error})` : ""}`
          : `Rejected ${json.results.length - errors.length} of ${input.submissionIds.length}`,
    };
  } catch {
    return { ok: false, message: "Gateway unreachable — try again." };
  }
}
