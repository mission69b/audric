import { PERMISSION_PRESETS, type UserPermissionConfig } from "@t2000/engine";
import { type NextRequest, NextResponse } from "next/server";
import { assertOwns, authenticateRequest } from "@/lib/audric-auth";
import { type Prisma, prisma } from "@/lib/prisma";

/**
 * GET /api/user/preferences?address=0x...
 *
 * Returns user preferences for the given Sui address.
 *
 * [SIMPLIFICATION DAY 5] `allowanceId` and `dcaSchedules` were dropped from
 * UserPreferences along with the on-chain allowance billing flow and the
 * never-shipped DCA scheduler. The remaining surface is `limits` (which
 * hosts the financial profile + permission preset + agent config) and the
 * inferred `permissionPreset` for client-side display.
 *
 * [v0.7e Phase 5 / S.254 — 2026-05-22] `contacts` column dropped from
 * UserPreferences (migration `20260522120000_v07e_drop_dead_tables_and_
 * columns`). Feature was retired in S.243; column has been unused since.
 * Response keeps `contacts: []` for one rotation so legacy clients don't
 * crash on the missing key — safe to remove from the response shape in
 * a follow-up.
 */
export async function GET(request: NextRequest) {
  // [SPEC 30 Phase 1A.6 — 2026-05-14] Bind JWT to ?address. Pre-fix
  // this route was wide-open by `?address=` — any caller could read
  // any user's contacts, financial profile, daily limits, permission
  // preset, and account-age via simple URL substitution.
  const auth = await authenticateRequest(request);
  if ("error" in auth) {
    return auth.error;
  }

  const address = request.nextUrl.searchParams.get("address");

  if (!address?.startsWith("0x")) {
    return NextResponse.json(
      { error: "Missing or invalid address" },
      { status: 400 }
    );
  }

  const ownership = assertOwns(auth.verified, address);
  if (ownership) {
    return ownership;
  }

  // Register address with indexer so on-chain transactions get tracked in stats.
  // Fire-and-forget — table may not exist if DB hasn't been shared yet.
  prisma.$executeRaw`
    INSERT INTO "Agent" (address, created_at)
    VALUES (${address}, NOW())
    ON CONFLICT (address) DO NOTHING
  `.catch(() => {
    // Intentionally swallowed: indexer table is optional during migration.
  });

  // [SPEC 30 D-13 — 2026-05-14] Read User.createdAt alongside prefs so
  // the client-side `shouldClientAutoApprove` mirror can apply the
  // <7d account-age gate. Without this leg, the server-side gate is
  // bypassable: server emits `pending_action` (tier=confirm), but the
  // client's `shouldClientAutoApprove` returns `true` (no gate
  // awareness) → auto-resolves the card → server executes the write.
  // Both legs MUST be in lockstep for the gate to be effective.
  const [prefs, userRecord] = await Promise.all([
    prisma.userPreferences.findUnique({ where: { address } }),
    prisma.user.findUnique({
      where: { suiAddress: address },
      select: { createdAt: true },
    }),
  ]);

  const accountAgeDays = userRecord?.createdAt
    ? Math.floor((Date.now() - userRecord.createdAt.getTime()) / 86_400_000)
    : null;

  if (!prefs) {
    return NextResponse.json({
      contacts: [],
      limits: null,
      permissionPreset: "balanced",
      accountAgeDays,
    });
  }

  const limitsObj =
    prefs.limits &&
    typeof prefs.limits === "object" &&
    !Array.isArray(prefs.limits)
      ? (prefs.limits as Record<string, unknown>)
      : null;
  const permissionPreset = limitsObj?.permissionPreset ?? "balanced";

  return NextResponse.json({
    contacts: [],
    limits: prefs.limits,
    permissionPreset,
    accountAgeDays,
  });
}

/**
 * POST /api/user/preferences
 *
 * Upserts user preferences for a Sui address.
 * Body: { address: string, limits?: object, permissionPreset?: ... }
 *
 * IMPORTANT: `limits` is shallow-merged with existing limits so callers can
 * update individual keys (financialProfile, permission preset, agent config)
 * without wiping others.
 *
 * [v0.7e Phase 5 / S.254 — 2026-05-22] `contacts` no longer accepted or
 * stored — column was dropped from UserPreferences. Any incoming
 * `contacts` body field is silently ignored.
 */
export async function POST(request: NextRequest) {
  // [SPEC 30 Phase 1A.6 — 2026-05-14] Bind JWT to body.address.
  // CRITICAL pre-fix: this route was wide-open and accepted
  // `permissionPreset` in the body — anyone could mutate any user's
  // permission preset to `aggressive`, which raises auto-execute
  // thresholds. Combined with the engine's `permissionConfig` read
  // path, this turned into a silent money-loss vector: the next chat
  // session would auto-execute writes the victim never opted into.
  const auth = await authenticateRequest(request);
  if ("error" in auth) {
    return auth.error;
  }

  let body: {
    address?: string;
    limits?: unknown;
    permissionPreset?: "conservative" | "balanced" | "aggressive";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, permissionPreset } = body;
  let { limits } = body;

  if (permissionPreset && permissionPreset in PERMISSION_PRESETS) {
    const config: UserPermissionConfig = PERMISSION_PRESETS[permissionPreset];
    limits = {
      ...(typeof limits === "object" && limits
        ? (limits as Record<string, unknown>)
        : {}),
      ...config,
      permissionPreset,
    };
  }

  if (!address || typeof address !== "string" || !address.startsWith("0x")) {
    return NextResponse.json(
      { error: "Missing or invalid address" },
      { status: 400 }
    );
  }

  const ownership = assertOwns(auth.verified, address);
  if (ownership) {
    return ownership;
  }

  let mergedLimits: Prisma.InputJsonValue | undefined;
  if (limits !== undefined) {
    const existing = await prisma.userPreferences.findUnique({
      where: { address },
      select: { limits: true },
    });
    const prev =
      existing?.limits &&
      typeof existing.limits === "object" &&
      !Array.isArray(existing.limits)
        ? (existing.limits as Record<string, unknown>)
        : {};
    mergedLimits = {
      ...prev,
      ...(limits as Record<string, unknown>),
    } as Prisma.InputJsonValue;
  }

  const update: Prisma.UserPreferencesUpdateInput = {};
  if (mergedLimits !== undefined) {
    update.limits = mergedLimits;
  }

  const prefs = await prisma.userPreferences.upsert({
    where: { address },
    create: {
      address,
      limits: (mergedLimits ?? limits) as Prisma.InputJsonValue | undefined,
    },
    update,
  });

  return NextResponse.json({
    contacts: [],
    limits: prefs.limits,
  });
}
