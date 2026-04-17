// Verify the seeded ScheduledAction is in correct state for dashboard display.
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx scripts/verify-copilot-test.ts <scheduledActionId>");
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 2,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const row = await prisma.scheduledAction.findUnique({
      where: { id },
      select: {
        id: true,
        actionType: true,
        amount: true,
        asset: true,
        targetAsset: true,
        cronExpr: true,
        nextRunAt: true,
        enabled: true,
        source: true,
        patternType: true,
        surfaceStatus: true,
        surfacedAt: true,
        expiresAt: true,
        failedAttempts: true,
        userId: true,
      },
    });
    console.log(JSON.stringify(row, null, 2));

    const dashboardEligible =
      row?.surfaceStatus === "pending" &&
      row?.surfacedAt !== null &&
      row?.enabled === true;
    console.log("\nDashboard query would return:", dashboardEligible);

    const recentEvents = await prisma.appEvent.findMany({
      where: {
        type: { startsWith: "copilot_suggestion" },
        details: { path: ["scheduledActionId"], equals: id },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { type: true, title: true, createdAt: true },
    });
    console.log("\nRecent AppEvents:", JSON.stringify(recentEvents, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
