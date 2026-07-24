import { env } from "@/lib/env";
import { syncAgentCapital } from "@/lib/capital/indexer";

// Vercel Cron → walk new agent_capital events (registry + lp_lock) into the
// AgentToken / FeeClaim read-model that powers the console's Capital tab and
// per-token fee ledger. Backstop for the console's sync-on-read. Vercel
// auto-sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const applied = await syncAgentCapital();
    return Response.json({ ok: true, applied });
  } catch (e) {
    console.error("[capital-index] sync failed", e);
    return Response.json({ ok: false, error: "sync failed" }, { status: 500 });
  }
}
