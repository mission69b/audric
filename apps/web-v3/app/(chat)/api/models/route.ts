import {
  getAllGatewayModels,
  getCapabilities,
  getModelPricing,
  isDemo,
} from "@/lib/ai/models";
import { isMemoryConfigured } from "@/lib/memwal";

export async function GET() {
  // Short browser TTL + long shared TTL with background revalidation: the model
  // catalog changes rarely, but a long browser max-age makes additive response
  // changes (e.g. a new pricing field) invisible to already-cached clients for
  // a full day. stale-while-revalidate keeps it instant while refreshing.
  const headers = {
    "Cache-Control":
      "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400",
  };

  const [curatedCapabilities, pricing] = await Promise.all([
    getCapabilities(),
    getModelPricing(),
  ]);

  const memoryEnabled = isMemoryConfigured();

  if (isDemo) {
    const models = await getAllGatewayModels();
    const capabilities = Object.fromEntries(
      models.map((m) => [m.id, curatedCapabilities[m.id] ?? m.capabilities])
    );

    return Response.json(
      { capabilities, models, pricing, memoryEnabled },
      { headers }
    );
  }

  return Response.json(
    { capabilities: curatedCapabilities, pricing, memoryEnabled },
    { headers }
  );
}
