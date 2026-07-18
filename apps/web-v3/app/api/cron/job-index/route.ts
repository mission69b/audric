import { env } from "@/lib/env";
import { syncEscrowJobs } from "@/lib/jobs/indexer";

// Vercel Cron → walk new a2a_escrow events into the EscrowJob read-model.
// Backstop only: /v1/jobs also syncs on read (≤15s stale), so this exists to
// keep the index warm when nobody is polling. Vercel auto-sends
// `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const applied = await syncEscrowJobs();
    return Response.json({ ok: true, applied });
  } catch (e) {
    console.error("[job-index] sync failed", e);
    return Response.json({ ok: false, error: "sync failed" }, { status: 500 });
  }
}
