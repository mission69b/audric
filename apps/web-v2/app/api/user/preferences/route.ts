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
 * never-shipped DCA scheduler. The remaining surface is `contacts`, `limits`
 * (which still hosts the financial profile + permission preset + agent
 * config — see `lib/engine/engine-context.ts`), and the inferred
 * `permissionPreset` for client-side display.
 *
 * [v0.7e Phase 2 / S.253 — 2026-05-22] Behavior-preserving port from
 * apps/web/app/api/user/preferences/route.ts, simplified for web-v2's
 * post-S.243 surface area:
 *   - Auth imports moved from `@/lib/auth` → `@/lib/audric-auth`.
 *   - `Prisma` type re-exported from `@/lib/prisma` (web-v2's adapter
 *     module already re-exports the Prisma namespace from the generated
 *     client; see `apps/web-v2/lib/prisma.ts`).
 *   - Contacts normalization DROPPED: `contact-schema.ts` was removed
 *     when contacts were retired in S.243. The legacy DB column is
 *     preserved on read (cast to an array, no schema parsing) and never
 *     written from this route, so users who set contacts via apps/web's
 *     UI keep their data; new web-v2 clients only write
 *     `limits`/`permissionPreset` and the read defensively coerces.
 *   - `runtime` segment export dropped to satisfy `nextConfig.cacheComponents`.
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

  // [v0.7e S.253] Contacts column passthrough — array shape is preserved
  // for users who set them in apps/web; web-v2 clients ignore the field
  // (it's not surfaced anywhere post-S.243 contacts retirement). Cast to
  // `unknown[]` defensively so a legacy null/object can't blow up the
  // client's `.map()`.
  const contactsForClient = Array.isArray(prefs.contacts) ? prefs.contacts : [];

  return NextResponse.json({
    contacts: contactsForClient,
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
 * [v0.7e S.253] `contacts` is NO LONGER accepted in the POST body — the
 * field is preserved verbatim on the DB row for users who set contacts via
 * apps/web's UI, but web-v2 cannot write new contact rows (the schema +
 * normalization layer was deleted in S.243). Any incoming `contacts` field
 * is silently ignored; the existing DB value is left untouched.
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
      contacts: [] as unknown as Prisma.InputJsonValue,
      limits: (mergedLimits ?? limits) as Prisma.InputJsonValue | undefined,
    },
    update,
  });

  const contactsForClient = Array.isArray(prefs.contacts) ? prefs.contacts : [];

  return NextResponse.json({
    contacts: contactsForClient,
    limits: prefs.limits,
  });
}
