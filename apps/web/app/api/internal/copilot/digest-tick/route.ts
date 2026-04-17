import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import type { InputJsonValue } from "@/lib/generated/prisma/internal/prismaNamespace";
import type { CopilotSuggestion, ScheduledAction } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { validateInternalKey } from "@/lib/internal-auth";
import { isCopilotEnabled } from "@/lib/feature-flags";
import {
  buildDigestHtml,
  buildDigestSubject,
  type DigestSuggestionRow,
} from "@/lib/copilot/digest-email";

export const runtime = "nodejs";
export const maxDuration = 300;

const DIGEST_DEDUP_HOURS = 23; // hourly cron — guard against double-send within the same window

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://audric.ai";
}

/**
 * POST /api/internal/copilot/digest-tick
 *
 * Hourly tick from t2000 copilotDigest cron. Selects users whose local hour
 * (now − timezoneOffset) matches `digestSendHourLocal`, builds a digest of
 * their unread Copilot suggestions, and sends one email via Resend.
 *
 * Idempotency: a user with `lastDigestSentAt` within the last 23h is skipped,
 * so re-firing the cron in the same window is safe. Users with zero pending
 * suggestions are skipped silently — no empty digests.
 *
 * Returns 404 when COPILOT_ENABLED=false so the cron no-ops.
 */
export async function POST(request: NextRequest) {
  if (!isCopilotEnabled()) {
    return NextResponse.json({ error: "Copilot disabled" }, { status: 404 });
  }

  const auth = validateInternalKey(request.headers.get("x-internal-key"));
  if ("error" in auth) return auth.error;

  const now = new Date();
  const dedupCutoff = new Date(now.getTime() - DIGEST_DEDUP_HOURS * 60 * 60 * 1000);

  // Pull all candidate users in one query, then filter the hour match in JS.
  // The compound index on (digestEnabled, emailDeliverable, digestSendHourLocal)
  // keeps this cheap even at scale.
  const candidates = await prisma.user.findMany({
    where: {
      digestEnabled: true,
      emailDeliverable: true,
      emailVerified: true,
      email: { not: null },
      OR: [
        { lastDigestSentAt: null },
        { lastDigestSentAt: { lt: dedupCutoff } },
      ],
    },
    select: {
      id: true,
      email: true,
      suiAddress: true,
      timezoneOffset: true,
      digestSendHourLocal: true,
    },
  });

  let evaluated = 0;
  let sent = 0;
  let skippedNoPending = 0;
  let skippedHourMismatch = 0;
  let errors = 0;

  const resend = getResend();

  for (const u of candidates) {
    evaluated++;

    const localMs = now.getTime() - u.timezoneOffset * 60 * 1000;
    const localHour = new Date(localMs).getUTCHours();
    if (localHour !== u.digestSendHourLocal) {
      skippedHourMismatch++;
      continue;
    }

    try {
      const result = await processUser(u, resend);
      if (result === "sent") sent++;
      else if (result === "no_pending") skippedNoPending++;
    } catch (err) {
      console.warn(`[digest-tick] user ${u.id} failed:`, err);
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    evaluated,
    sent,
    skippedNoPending,
    skippedHourMismatch,
    errors,
  });
}

interface CandidateUser {
  id: string;
  email: string | null;
  suiAddress: string;
  timezoneOffset: number;
  digestSendHourLocal: number;
}

type ProcessOutcome = "sent" | "no_pending" | "no_resend";

async function processUser(
  user: CandidateUser,
  resend: Resend | null
): Promise<ProcessOutcome> {
  if (!user.email) return "no_pending";

  const nowDate = new Date();

  // Mirror the dashboard's GET /api/copilot/suggestions filter so the digest
  // shows the same things the user would see on /new. Snoozed (surfacedAt in
  // future) and expired rows are excluded.
  const [scheduledActions, copilotSuggestions] = await Promise.all([
    prisma.scheduledAction.findMany({
      where: {
        userId: user.id,
        surfaceStatus: "pending",
        surfacedAt: { not: null, lte: nowDate },
        OR: [{ expiresAt: null }, { expiresAt: { gt: nowDate } }],
      },
      orderBy: { surfacedAt: "asc" },
      take: 5,
    }),
    prisma.copilotSuggestion.findMany({
      where: {
        userId: user.id,
        status: "pending",
        surfacedAt: { lte: nowDate },
        expiresAt: { gt: nowDate },
      },
      orderBy: { surfacedAt: "asc" },
      take: 5,
    }),
  ]);

  const totalPending = scheduledActions.length + copilotSuggestions.length;
  if (totalPending === 0) return "no_pending";

  const rows: DigestSuggestionRow[] = [
    ...scheduledActions.map(scheduledActionToRow),
    ...copilotSuggestions.map(copilotSuggestionToRow),
  ];

  const baseUrl = getBaseUrl();

  if (!resend) {
    console.log(
      `[digest-tick] RESEND_API_KEY not set. Would email ${user.email} ` +
        `with ${totalPending} pending`,
    );
    return "no_resend";
  }

  await resend.emails.send({
    from: "Audric <notifications@audric.ai>",
    to: user.email,
    subject: buildDigestSubject(totalPending),
    html: buildDigestHtml({
      rows,
      totalPending,
      baseUrl,
      unsubscribeUrl: `${baseUrl}/settings/copilot`,
    }),
  });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { lastDigestSentAt: nowDate },
    }),
    prisma.appEvent.create({
      data: {
        address: user.suiAddress,
        type: "copilot_digest_sent",
        title: `Digest sent — ${totalPending} pending`,
        details: {
          totalPending,
          scheduledActionIds: scheduledActions.map((s) => s.id),
          copilotSuggestionIds: copilotSuggestions.map((s) => s.id),
        } as InputJsonValue,
      },
    }),
  ]);

  return "sent";
}

// -----------------------------------------------------------------------------
// Row formatters — duplicated (V1) from CopilotSuggestionCard.tsx; if we add
// more types we should extract these into lib/copilot/describe-suggestion.ts
// and have both the card + digest import from one place.
// -----------------------------------------------------------------------------

function fmtCron(expr: string): string {
  if (expr === "0 0 * * 5") return "every Friday";
  if (expr === "0 0 * * *") return "every day";
  if (expr.startsWith("0 0 * * ")) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dow = parseInt(expr.split(" ")[4], 10);
    if (!Number.isNaN(dow) && days[dow]) return `every ${days[dow]}`;
  }
  if (expr === "0 0 1 * *") return "monthly";
  return expr;
}

function fmtAmount(raw: string, asset: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${raw} ${asset}`;
  if (n >= 1) return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${asset}`;
  return `${n.toFixed(4).replace(/0+$/, "")} ${asset}`;
}

function scheduledActionToRow(s: ScheduledAction): DigestSuggestionRow {
  const cadence = fmtCron(s.cronExpr);
  const amount = fmtAmount(s.amount.toString(), s.asset);
  const target = s.targetAsset ? ` into ${s.targetAsset}` : "";

  if (s.actionType === "save") {
    return baseRow(s.id, "scheduled_action", s.actionType,
      `Save ${amount}`, `${cadence} · earns NAVI APY`, "Save");
  }
  if (s.actionType === "swap") {
    return baseRow(s.id, "scheduled_action", s.actionType,
      `Swap ${amount}${target}`, `${cadence} · best route via Cetus`, "Swap");
  }
  if (s.actionType === "stake") {
    return baseRow(s.id, "scheduled_action", s.actionType,
      `Stake ${amount} (Volo)`, `${cadence} · liquid SUI staking`, "Stake");
  }
  if (s.actionType === "send") {
    return baseRow(s.id, "scheduled_action", s.actionType,
      `Send ${amount}`, cadence, "Send");
  }
  return baseRow(s.id, "scheduled_action", s.actionType,
    `${s.actionType} ${amount}`, cadence, "Confirm");
}

function copilotSuggestionToRow(s: CopilotSuggestion): DigestSuggestionRow {
  const payload = (s.payload as Record<string, unknown> | null) ?? {};
  const usd = typeof payload.amountUsd === "number" ? payload.amountUsd : null;
  const apy = typeof payload.projectedApy === "number" ? payload.projectedApy : null;
  const apyStr = apy !== null ? ` · projected ${(apy * 100).toFixed(1)}% APY` : "";
  const usdStr = usd !== null ? `$${usd.toFixed(2)}` : "";

  if (s.type === "compound") {
    return baseRow(s.id, "copilot_suggestion", s.type,
      `Compound ${usdStr || "rewards"} into savings`,
      `NAVI rewards ready${apyStr}`, "Compound");
  }
  if (s.type === "idle_action") {
    const action = typeof payload.action === "string" ? payload.action : "save";
    return baseRow(s.id, "copilot_suggestion", s.type,
      `${action === "save" ? "Save" : "Stake"} ${usdStr || "idle balance"}`,
      `Idle balance detected${apyStr}`,
      action === "save" ? "Save" : "Stake");
  }
  if (s.type === "income_action") {
    const action = typeof payload.action === "string" ? payload.action : "save";
    return baseRow(s.id, "copilot_suggestion", s.type,
      `${action === "save" ? "Save" : "Allocate"} ${usdStr || "incoming deposit"}`,
      `Recurring deposit detected${apyStr}`,
      action === "save" ? "Save" : "Allocate");
  }
  if (s.type === "hf_topup") {
    const hf = typeof payload.healthFactor === "number" ? payload.healthFactor.toFixed(2) : "low";
    return baseRow(s.id, "copilot_suggestion", s.type,
      `Repay ${usdStr || "to lift HF"}`,
      `Health factor ${hf} — protect your position`, "Repay");
  }
  return baseRow(s.id, "copilot_suggestion", s.type,
    "Audric noticed something", "Open to review", "Review");
}

function baseRow(
  id: string,
  kind: DigestSuggestionRow["kind"],
  type: string,
  title: string,
  subtitle: string,
  actionVerb: string,
): DigestSuggestionRow {
  return {
    kind,
    id,
    type,
    title,
    subtitle,
    actionLabel: `${actionVerb} →`,
  };
}
