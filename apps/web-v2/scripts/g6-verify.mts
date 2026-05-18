/**
 * G6 smoke verifier — reads TurnMetrics rows from NeonDB for one or
 * more session ids and prints the cache + thinking + token + cost
 * fields used to validate AI Gateway passthrough per BENEFITS_SPEC_v07c
 * §"Phase 2 Day 2c / G6 acceptance".
 *
 * Usage:
 *   pnpm tsx scripts/g6-verify.mts <sessionId> [<sessionId> ...]
 */

import { prisma } from "../lib/prisma";

async function main() {
  const sessions = process.argv.slice(2);
  if (sessions.length === 0) {
    console.error("usage: tsx scripts/g6-verify.mts <sessionId> [...]");
    process.exit(2);
  }
  const rows = await prisma.turnMetrics.findMany({
    where: { sessionId: { in: sessions } },
    orderBy: [{ sessionId: "asc" }, { turnIndex: "asc" }],
  });
  for (const r of rows) {
    const tools = Array.isArray(r.toolsCalled)
      ? (r.toolsCalled as Array<{ name?: string }>)
          .map((t) => t.name ?? "?")
          .join(",")
      : "-";
    console.log(
      JSON.stringify({
        sessionId: r.sessionId,
        turn: r.turnIndex,
        model: r.modelUsed,
        effort: r.effortLevel,
        cacheHit: r.cacheHit,
        cacheR: r.cacheReadTokens,
        cacheW: r.cacheWriteTokens,
        in: r.inputTokens,
        out: r.outputTokens,
        wallMs: r.wallTimeMs,
        ttfvpMs: r.ttfvpMs,
        firstTokenMs: r.firstTokenMs,
        costUsd: Number(r.estimatedCostUsd).toFixed(6),
        tools,
      })
    );
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
