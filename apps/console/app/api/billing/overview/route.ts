import { getCurrentUser } from "@audric/auth/server";
import { getBillingOverview } from "@/lib/billing";

// Read-only billing snapshot for the console — saved cards + payment history.
export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const overview = await getBillingOverview(session.user.id);
  return Response.json(overview);
}
