/**
 * Extract `package::module::function` move-call targets from a Sui PTB.
 *
 * Sui PTB command shape (per `@mysten/sui` v2 internal type):
 *   { $kind: 'MoveCall', MoveCall: { package, module, function, ... } }
 *
 * Enoki's sponsor `allowedMoveCallTargets` allow-list expects the
 * `package::module::function` convention (NOT the raw split form), so we
 * construct it ourselves.
 *
 * Extracted from `app/api/transactions/prepare/route.ts` so it can be
 * unit-tested in `scripts/smoke-b1-b1a.mts` without booting the route's
 * Next.js + Enoki + Sui transaction-builder dependency graph.
 *
 * Background: pre-v0.7c-phase6, `web-v2`'s `extractMoveCallTargets` read
 * a nonexistent `.target` property on the command shape and returned an
 * empty array. Enoki then fell back to its default allowlist, which
 * blocked legitimate `0x2::coin::value` calls with a 400. The fix landed
 * in S.185 (2026-05-20) — see `audric-build-tracker.md`.
 */
export function extractMoveCallTargets(tx: unknown): string[] {
  const targets = new Set<string>();
  if (tx == null || typeof tx !== "object") {
    return [];
  }
  const data = (
    tx as {
      getData?: () => {
        commands?: Array<{
          $kind?: string;
          MoveCall?: { package?: string; module?: string; function?: string };
        }>;
      };
    }
  ).getData?.();
  const commands = Array.isArray(data?.commands) ? data.commands : [];
  for (const cmd of commands) {
    if (
      cmd?.$kind === "MoveCall" &&
      cmd.MoveCall?.package &&
      cmd.MoveCall.module &&
      cmd.MoveCall.function
    ) {
      targets.add(
        `${cmd.MoveCall.package}::${cmd.MoveCall.module}::${cmd.MoveCall.function}`
      );
    }
  }
  return Array.from(targets);
}
