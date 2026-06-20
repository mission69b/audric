import {
  CONFIDENTIAL_CAPABILITIES,
  confidentialModels,
  getAllGatewayModels,
  getCapabilities,
  getModelPricing,
  isDemo,
} from "@/lib/ai/models";
import {
  getConfidentialPricing,
  isConfidentialConfigured,
} from "@/lib/ai/providers";
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

  const confidentialEnabled = isConfidentialConfigured();

  const [curatedCapabilities, gatewayPricing, confidentialPricing] =
    await Promise.all([
      getCapabilities(),
      getModelPricing(),
      confidentialEnabled ? getConfidentialPricing() : Promise.resolve({}),
    ]);

  const memoryEnabled = isMemoryConfigured();

  // Merge the confidential (TEE) lineup in only when the tier is live, so the
  // switcher surfaces those models, badges, and per-token prices exactly when
  // they're actually routable.
  const capabilities = confidentialEnabled
    ? { ...curatedCapabilities, ...CONFIDENTIAL_CAPABILITIES }
    : curatedCapabilities;
  const pricing = { ...gatewayPricing, ...confidentialPricing };
  const confidential = confidentialEnabled ? confidentialModels : [];

  if (isDemo) {
    const models = await getAllGatewayModels();
    const demoCapabilities = Object.fromEntries(
      models.map((m) => [m.id, capabilities[m.id] ?? m.capabilities])
    );

    return Response.json(
      {
        capabilities: { ...demoCapabilities, ...CONFIDENTIAL_CAPABILITIES },
        models: [...models, ...confidential],
        pricing,
        memoryEnabled,
        confidentialEnabled,
        confidentialModels: confidential,
      },
      { headers }
    );
  }

  return Response.json(
    {
      capabilities,
      pricing,
      memoryEnabled,
      confidentialEnabled,
      confidentialModels: confidential,
    },
    { headers }
  );
}
