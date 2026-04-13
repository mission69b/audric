import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const revalidate = 60;

export async function GET() {
  try {
    const [
      userCount,
      usageAgg,
      sessionCount,
      transactionCount,
      toolExecutions,
    ] = await Promise.all([
      prisma.user.count(),

      prisma.sessionUsage.aggregate({
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheReadTokens: true,
          cacheWriteTokens: true,
          costUsd: true,
        },
        _count: true,
      }),

      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT "sessionId") AS count FROM "SessionUsage"
      `.then(([row]) => Number(row.count)),

      prisma.appEvent.count(),

      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COALESCE(SUM(array_length("toolNames", 1)), 0) AS count FROM "SessionUsage"
      `.then(([row]) => Number(row.count)),
    ]);

    const sum = usageAgg._sum;
    const totalInput = sum.inputTokens ?? 0;
    const totalOutput = sum.outputTokens ?? 0;
    const totalCacheRead = sum.cacheReadTokens ?? 0;
    const totalCacheWrite = sum.cacheWriteTokens ?? 0;
    const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheWrite;
    const totalCostUsd = sum.costUsd ?? 0;

    const effectiveInputTokens = totalInput + totalCacheRead + totalCacheWrite;
    const cacheSavingsPercent = effectiveInputTokens > 0
      ? Math.round((totalCacheRead / effectiveInputTokens) * 100)
      : 0;

    const topTools = await getTopTools();

    const stats = {
      totalUsers: userCount,
      totalSessions: sessionCount,
      totalTurns: usageAgg._count,
      totalTokens,
      totalCostUsd: Math.round(totalCostUsd * 1000) / 1000,
      avgCostPerSession: sessionCount > 0
        ? Math.round((totalCostUsd / sessionCount) * 10000) / 10000
        : 0,
      cacheSavingsPercent,
      totalTransactions: transactionCount,
      totalToolExecutions: toolExecutions,
      topTools,
    };

    return Response.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('[api/stats] error:', err);
    return Response.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

async function getTopTools(): Promise<{ name: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ name: string; count: bigint }[]>`
    SELECT unnest("toolNames") AS name, COUNT(*) AS count
    FROM "SessionUsage"
    GROUP BY name
    ORDER BY count DESC
    LIMIT 10
  `;

  return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
}
