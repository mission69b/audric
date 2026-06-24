import {
  getAllGatewayModels,
  getCapabilities,
  getModelPricing,
  isDemo,
} from "@/lib/ai/models";
import { marginFor } from "@/lib/credit/meter";
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

  const [capabilities, gatewayPricing] = await Promise.all([
    getCapabilities(),
    getModelPricing(),
  ]);

  const memoryEnabled = isMemoryConfigured();

  // Show the CHARGED rate (Gateway list × the model's margin), not raw cost — so
  // the switcher price matches what actually debits from credit (the meter applies
  // the SAME per-model margin via `marginFor`). What you see = what you pay.
  const pricing = Object.fromEntries(
    Object.entries(gatewayPricing).map(([id, p]) => {
      const margin = marginFor(id);
      return [
        id,
        {
          ...p,
          inputPer1M: p.inputPer1M * margin,
          outputPer1M: p.outputPer1M * margin,
        },
      ];
    })
  );

  if (isDemo) {
    const models = await getAllGatewayModels();
    const demoCapabilities = Object.fromEntries(
      models.map((m) => [m.id, capabilities[m.id] ?? m.capabilities])
    );

    return Response.json(
      {
        capabilities: demoCapabilities,
        models,
        pricing,
        memoryEnabled,
      },
      { headers }
    );
  }

  return Response.json(
    {
      capabilities,
      pricing,
      memoryEnabled,
    },
    { headers }
  );
}
