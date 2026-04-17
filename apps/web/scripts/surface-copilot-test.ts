// One-shot: reset + immediately surface a behavior_detected ScheduledAction
// for end-to-end browser testing.
// Usage: pnpm dlx tsx --env-file=.env.local scripts/surface-copilot-test.ts <suiAddress>

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const address = process.argv[2];
  if (!address) {
    console.error("Usage: tsx scripts/surface-copilot-test.ts <suiAddress>");
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 2,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true, suiAddress: true, lastDashboardVisitAt: true },
    });
    if (!user) {
      console.error("User not found:", address);
      process.exit(2);
    }

    // 1. Clear lastDashboardVisitAt so the in-chat surface isn't suppressed.
    await prisma.user.update({
      where: { id: user.id },
      data: { lastDashboardVisitAt: null },
    });

    // 2. Reset (or create) a behavior_detected swap suggestion and surface it now.
    const existing = await prisma.scheduledAction.findFirst({
      where: {
        userId: user.id,
        actionType: "swap",
        asset: "USDC",
        targetAsset: "MANIFEST",
        source: "behavior_detected",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let actionId: string;
    if (existing) {
      const updated = await prisma.scheduledAction.update({
        where: { id: existing.id },
        data: {
          surfaceStatus: "pending",
          surfacedAt: now,
          expiresAt: expires,
          failedAttempts: 0,
          enabled: true,
          pausedAt: null,
        },
        select: { id: true },
      });
      actionId = updated.id;
    } else {
      const created = await prisma.scheduledAction.create({
        data: {
          userId: user.id,
          actionType: "swap",
          amount: 0.1,
          asset: "USDC",
          targetAsset: "MANIFEST",
          cronExpr: "0 9 * * 1",
          nextRunAt: now,
          enabled: true,
          confirmationsRequired: 0,
          confirmationsCompleted: 0,
          source: "behavior_detected",
          patternType: "swap_pattern",
          detectedAt: now,
          confidence: 0.9,
          stage: 2,
          surfaceStatus: "pending",
          surfacedAt: now,
          expiresAt: expires,
        },
        select: { id: true },
      });
      actionId = created.id;
    }

    // 3. Also seed an idle_action CopilotSuggestion so we exercise the
    //    one-shot row alongside the scheduled-action row.
    await prisma.copilotSuggestion.deleteMany({
      where: { userId: user.id, type: "idle_action", status: "pending" },
    });
    const idle = await prisma.copilotSuggestion.create({
      data: {
        userId: user.id,
        type: "idle_action",
        status: "pending",
        surfacedAt: now,
        expiresAt: expires,
        payload: {
          asset: "USDC",
          amount: 5,
          amountUsd: 5,
          action: "save",
          projectedApy: 0.04,
        },
      },
      select: { id: true },
    });

    console.log(JSON.stringify({
      ok: true,
      address,
      lastDashboardVisitAt: "cleared",
      scheduledActionId: actionId,
      copilotSuggestionId: idle.id,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
