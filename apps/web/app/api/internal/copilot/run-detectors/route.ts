import { NextRequest, NextResponse } from "next/server";
import type { InputJsonValue } from "@/lib/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";
import { validateInternalKey } from "@/lib/internal-auth";
import { isCopilotEnabled } from "@/lib/feature-flags";
import { fetchWalletBalances, fetchPositions } from "@/lib/portfolio-data";
import { runAllDetectors, type DetectedSuggestion } from "@/lib/copilot/detectors";

export const runtime = "nodejs";
export const maxDuration = 300; // up to 5min — RPC-bound across N users

const SUGGESTION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const THROTTLE_WINDOW_HOURS = 24;
const ELIGIBLE_USER_WINDOW_DAYS = 30;
const CONCURRENCY = 3;
const PER_USER_TIMEOUT_MS = 15_000;

/**
 * POST /api/internal/copilot/run-detectors
 * Called by the t2000 copilotDetectors hourly cron.
 *
 * Iterates Copilot-eligible users, runs the threshold detectors
 * (idle_usdc + idle_sui), and surfaces fresh `idle_action` suggestions via
 * the same DB write path as `/api/internal/copilot/surface-suggestion`.
 *
 * Throttled per (userId, type) to a 24h window — running this hourly is safe.
 *
 * Returns 404 (not 503) when COPILOT_ENABLED=false so the cron no-ops silently.
 */
export async function POST(request: NextRequest) {
  if (!isCopilotEnabled()) {
    return NextResponse.json({ error: "Copilot disabled" }, { status: 404 });
  }

  const auth = validateInternalKey(request.headers.get("x-internal-key"));
  if ("error" in auth) return auth.error;

  // "Eligible" = active in the last N days (lastDashboardVisitAt OR
  // recently created). Filters out long-dormant accounts so we don't
  // burn RPC quota on inactive users.
  const cutoff = new Date(Date.now() - ELIGIBLE_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { lastDashboardVisitAt: { gte: cutoff } },
        { createdAt: { gte: cutoff } },
      ],
    },
    select: { id: true, suiAddress: true },
  });

  let scanned = 0;
  let surfaced = 0;
  let throttled = 0;
  let errors = 0;

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((u) => withTimeout(processUser(u.id, u.suiAddress), PER_USER_TIMEOUT_MS))
    );

    for (const r of results) {
      scanned++;
      if (r.status === "rejected") {
        errors++;
        continue;
      }
      surfaced += r.value.surfaced;
      throttled += r.value.throttled;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned,
    surfaced,
    throttled,
    errors,
  });
}

interface UserResult {
  surfaced: number;
  throttled: number;
}

async function processUser(userId: string, address: string): Promise<UserResult> {
  let surfaced = 0;
  let throttled = 0;

  let wallet, positions;
  try {
    [wallet, positions] = await Promise.all([
      fetchWalletBalances(address),
      fetchPositions(address),
    ]);
  } catch {
    // RPC fail for this user — skip, don't crash the batch
    return { surfaced: 0, throttled: 0 };
  }

  const detected = runAllDetectors({ wallet, positions });

  for (const suggestion of detected) {
    const result = await surfaceDetected(userId, address, suggestion);
    if (result === "surfaced") surfaced++;
    else if (result === "throttled") throttled++;
  }

  return { surfaced, throttled };
}

type SurfaceOutcome = "surfaced" | "throttled" | "error";

async function surfaceDetected(
  userId: string,
  address: string,
  suggestion: DetectedSuggestion
): Promise<SurfaceOutcome> {
  const throttleSince = new Date(Date.now() - THROTTLE_WINDOW_HOURS * 60 * 60 * 1000);

  // Same throttle semantics as /api/internal/copilot/surface-suggestion —
  // any pending or recently-created suggestion of this type for this user
  // suppresses re-surfacing.
  const recent = await prisma.copilotSuggestion.findFirst({
    where: {
      userId,
      type: suggestion.type,
      createdAt: { gt: throttleSince },
    },
    select: { id: true },
  });

  if (recent) return "throttled";

  const expiresAt = new Date(Date.now() + SUGGESTION_TTL_MS);

  try {
    const created = await prisma.copilotSuggestion.create({
      data: {
        userId,
        type: suggestion.type,
        status: "pending",
        payload: suggestion.payload as InputJsonValue,
        expiresAt,
      },
      select: { id: true },
    });

    await prisma.appEvent.create({
      data: {
        address,
        type: "copilot_suggestion_created",
        title: titleForSuggestion(suggestion),
        details: {
          kind: "copilot_suggestion",
          copilotSuggestionId: created.id,
          type: suggestion.type,
          source: "detector",
        } as InputJsonValue,
      },
    });

    return "surfaced";
  } catch (err) {
    console.warn("[run-detectors] surface failed:", err);
    return "error";
  }
}

function titleForSuggestion(s: DetectedSuggestion): string {
  if (s.type === "idle_action") {
    const action = (s.payload as Record<string, unknown>).action;
    return action === "stake"
      ? "Audric noticed idle SUI"
      : "Audric noticed an idle balance";
  }
  return "Audric noticed something";
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("user_timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      }
    );
  });
}
