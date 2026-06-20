import { isConfidentialModel } from "@/lib/ai/models";
import { fetchTeeReceipt } from "@/lib/ai/providers";

/**
 * TEE-signed receipt for a confidential completion (the "signed-receipt badge"
 * MVP, SPEC_AUDRIC_V3 §5c). The client passes the confidential response id +
 * model from the `data-tee-receipt` stream part; we proxy RedPill's signature
 * endpoint (server holds the key). Returns 204 when there's nothing to show —
 * the badge silently degrades, never errors the chat.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const model = searchParams.get("model");

  if (!(id && model && isConfidentialModel(model))) {
    return new Response(null, { status: 204 });
  }

  const receipt = await fetchTeeReceipt(id, model);
  if (!receipt) {
    return new Response(null, { status: 204 });
  }

  return Response.json(receipt, {
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
