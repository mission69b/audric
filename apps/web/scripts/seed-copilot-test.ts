// One-shot seed for Copilot end-to-end test.
// Usage: pnpm dlx tsx --env-file=.env.local scripts/seed-copilot-test.ts <suiAddress>

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const address = process.argv[2];
  if (!address) {
    console.error("Usage: tsx scripts/seed-copilot-test.ts <suiAddress>");
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
      select: { id: true, suiAddress: true, email: true, createdAt: true },
    });

    if (!user) {
      console.error(JSON.stringify({ error: "User not found", address }, null, 2));
      process.exit(2);
    }

    console.error(JSON.stringify({ user }, null, 2));

    const existing = await prisma.scheduledAction.findFirst({
      where: {
        userId: user.id,
        actionType: "swap",
        asset: "USDC",
        targetAsset: "MANIFEST",
        source: "behavior_detected",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, surfaceStatus: true, surfacedAt: true, nextRunAt: true, enabled: true },
    });

    let actionId: string;
    if (existing) {
      const updated = await prisma.scheduledAction.update({
        where: { id: existing.id },
        data: {
          nextRunAt: new Date(),
          surfaceStatus: "pending",
          surfacedAt: null,
          expiresAt: null,
          failedAttempts: 0,
          enabled: true,
          pausedAt: null,
        },
        select: { id: true, surfaceStatus: true, surfacedAt: true, nextRunAt: true },
      });
      actionId = updated.id;
      console.error(JSON.stringify({ reused: updated }, null, 2));
    } else {
      const created = await prisma.scheduledAction.create({
        data: {
          userId: user.id,
          actionType: "swap",
          amount: 0.1,
          asset: "USDC",
          targetAsset: "MANIFEST",
          cronExpr: "0 9 * * 1",
          nextRunAt: new Date(),
          enabled: true,
          confirmationsRequired: 0,
          confirmationsCompleted: 0,
          source: "behavior_detected",
          patternType: "swap_pattern",
          detectedAt: new Date(),
          confidence: 0.9,
          stage: 2,
        },
        select: { id: true, surfaceStatus: true, surfacedAt: true, nextRunAt: true },
      });
      actionId = created.id;
      console.error(JSON.stringify({ created }, null, 2));
    }

    console.log(actionId);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
