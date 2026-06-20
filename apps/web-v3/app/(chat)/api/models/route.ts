import {
  confidentialModels,
  getAllGatewayModels,
  getCapabilities,
  getModelPricing,
  isDemo,
} from "@/lib/ai/models";
import {
  getConfidentialCatalog,
  isConfidentialConfigured,
} from "@/lib/ai/providers";
import { CREDIT_MARGIN } from "@/lib/credit/meter";
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

  const [curatedCapabilities, gatewayPricing, confidential] = await Promise.all(
    [getCapabilities(), getModelPricing(), getConfidentialCatalog()]
  );

  const memoryEnabled = isMemoryConfigured();

  // Merge the confidential (TEE) lineup in only when the tier is live, so the
  // switcher surfaces those models, badges, and per-token prices exactly when
  // they're actually routable. Caps + pricing are derived from RedPill's live
  // catalog (single source of truth).
  const capabilities = { ...curatedCapabilities, ...confidential.capabilities };
  // Show the CHARGED rate (Gateway list × CREDIT_MARGIN), not raw cost — so the
  // switcher price matches what actually debits from credit (meter applies the
  // same margin). What you see = what you pay.
  const pricing = Object.fromEntries(
    Object.entries({ ...gatewayPricing, ...confidential.pricing }).map(
      ([id, p]) => [
        id,
        {
          ...p,
          inputPer1M: p.inputPer1M * CREDIT_MARGIN,
          outputPer1M: p.outputPer1M * CREDIT_MARGIN,
        },
      ]
    )
  );
  const confidentialLineup = confidentialEnabled ? confidentialModels : [];

  if (isDemo) {
    const models = await getAllGatewayModels();
    const demoCapabilities = Object.fromEntries(
      models.map((m) => [m.id, capabilities[m.id] ?? m.capabilities])
    );

    return Response.json(
      {
        capabilities: { ...demoCapabilities, ...confidential.capabilities },
        models: [...models, ...confidentialLineup],
        pricing,
        memoryEnabled,
        confidentialEnabled,
        confidentialModels: confidentialLineup,
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
      confidentialModels: confidentialLineup,
    },
    { headers }
  );
}
