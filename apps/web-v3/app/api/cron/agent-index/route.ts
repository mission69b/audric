import { reconcileAgentDirectory } from "@/lib/agent/indexer";
import { env } from "@/lib/env";

// Vercel Cron → reconcile the Agent ID directory (gate 6). Backfills numericId +
// syncs owner/active/metadataUri + catches third-party registrations. Vercel
// auto-sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const { synced } = await reconcileAgentDirectory();
    return Response.json({ ok: true, synced });
  } catch (e) {
    console.error("[agent-index] reconcile failed", e);
    return Response.json(
      { ok: false, error: "reconcile failed" },
      { status: 500 }
    );
  }
}
