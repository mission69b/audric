import { type NextRequest, NextResponse } from "next/server";
import { assertOwns, authenticateRequest } from "@/lib/audric-auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/mpp/budget
 *
 * Server-enforced daily spend ceiling for MPP Service consumption
 * (mpp_call). Two actions on one route:
 *
 *   { action: "check",  address, amountUsd }
 *     → { allowed, capUsd, spentUsd, remainingUsd }
 *       The client calls this BEFORE running a gasless mpp_call payment.
 *       If `allowed` is false the client aborts the call and the agent
 *       narrates the limit instead of moving money.
 *
 *   { action: "record", address, amountUsd, serviceId }
 *     → { recorded, capUsd, spentUsd }
 *       The client calls this AFTER a successful payment to write the
 *       durable ServicePurchase ledger row that the next check sums (and
 *       that /api/analytics/spending already reads).
 *
 * Why server-side: the cap must survive page reload / multi-tab and not
 * be bypassable from the client. The ledger is `ServicePurchase` (the
 * writer S.245 removed when `pay_api` was deleted — revived here as the
 * canonical MPP-consumption ledger, which is what SPEC_AUDRIC_TOPUP_
 * METERING wants anyway). Cap setting lives in `UserPreferences.limits`
 * JSON as `mppDailyCapUsd` (no migration — the limits column already
 * shallow-merges arbitrary keys via /api/user/preferences).
 *
 * Scope: MPP consumption ONLY. Principal movements (send/save/borrow) are
 * NOT counted here — they each tap-to-confirm under Passport regardless.
 */

// Default daily ceiling for accounts that haven't set one. `null` in the
// stored prefs means the user explicitly turned the cap OFF (no ceiling;
// every call still taps).
const DEFAULT_CAP_USD = 10;

function readCapUsd(limits: unknown): number | null {
  if (limits && typeof limits === "object" && !Array.isArray(limits)) {
    const raw = (limits as Record<string, unknown>).mppDailyCapUsd;
    if (raw === null) {
      return null; // explicit "Off"
    }
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
  }
  return DEFAULT_CAP_USD;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

async function spentTodayUsd(address: string): Promise<number> {
  const agg = await prisma.servicePurchase.aggregate({
    _sum: { amountUsd: true },
    where: {
      address,
      status: "completed",
      createdAt: { gte: startOfTodayUtc() },
    },
  });
  return agg._sum.amountUsd ?? 0;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) {
    return auth.error;
  }

  let body: {
    address?: string;
    action?: "check" | "record";
    amountUsd?: number;
    serviceId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, action, amountUsd, serviceId } = body;

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
  if (
    !(
      typeof amountUsd === "number" &&
      Number.isFinite(amountUsd) &&
      amountUsd >= 0
    )
  ) {
    return NextResponse.json({ error: "Invalid amountUsd" }, { status: 400 });
  }

  const prefs = await prisma.userPreferences.findUnique({
    where: { address },
    select: { limits: true },
  });
  const capUsd = readCapUsd(prefs?.limits);

  if (action === "record") {
    await prisma.servicePurchase.create({
      data: {
        address,
        serviceId: (serviceId || "mpp").slice(0, 64),
        amountUsd,
        status: "completed",
      },
    });
    const spentUsd = await spentTodayUsd(address);
    return NextResponse.json({ recorded: true, capUsd, spentUsd });
  }

  // Default action: check.
  const spentUsd = await spentTodayUsd(address);
  // `+ 1e-9` absorbs float dust so an exact-to-the-cent call at the cap
  // isn't rejected by rounding.
  const allowed = capUsd === null || spentUsd + amountUsd <= capUsd + 1e-9;
  const remainingUsd = capUsd === null ? null : Math.max(0, capUsd - spentUsd);
  return NextResponse.json({ allowed, capUsd, spentUsd, remainingUsd });
}
