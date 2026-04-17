// Debug: check API state for in-chat surface
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const address = process.argv[2];
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 2,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true, lastDashboardVisitAt: true },
    });
    console.log("User:", JSON.stringify(user, null, 2));

    const now = new Date();
    const cs = await prisma.copilotSuggestion.findMany({
      where: {
        userId: user!.id,
        status: "pending",
        surfacedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true, type: true, surfacedAt: true, expiresAt: true, payload: true },
    });
    console.log("Pending CopilotSuggestions:", cs.length, JSON.stringify(cs, null, 2));

    const sa = await prisma.scheduledAction.findMany({
      where: {
        userId: user!.id,
        enabled: true,
        surfaceStatus: "pending",
        surfacedAt: { not: null, lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true, actionType: true, asset: true, targetAsset: true, surfacedAt: true },
    });
    console.log("Pending ScheduledActions:", sa.length, JSON.stringify(sa, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
