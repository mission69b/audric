import { getApiUsageByModel } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";

const DAY_MS = 24 * 60 * 60 * 1000;

// Per-model usage aggregate for the My-usage screen (SPEC_T2000_API_V2 M4).
export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const windowParam =
    new URL(request.url).searchParams.get("window") === "24h" ? "24h" : "30d";
  const sinceMs = Date.now() - (windowParam === "24h" ? DAY_MS : 30 * DAY_MS);
  const rows = await getApiUsageByModel(session.user.id, sinceMs);
  return Response.json({ window: windowParam, rows });
}
