// Quick reset of lastDashboardVisitAt for in-chat surface testing.
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const address = process.argv[2];
  if (!address) {
    console.error("Usage: tsx scripts/clear-dashboard-visit.ts <suiAddress>");
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 2,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const u = await prisma.user.update({
      where: { suiAddress: address },
      data: { lastDashboardVisitAt: null },
      select: { suiAddress: true, lastDashboardVisitAt: true },
    });
    console.log(JSON.stringify(u, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
