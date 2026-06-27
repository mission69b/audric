import { getModelPricing } from "@/lib/ai/models";
import { authenticateApiKey } from "@/lib/api/keys";
import { apiMarginFor, apiModels } from "@/lib/api/models";
import { getPhalaPricing } from "@/lib/api/providers";

// GET /v1/models — OpenAI-compatible catalog (SPEC_AUDRIC_API v1/v1.5). Returns
// the intersection of our curated set with the LIVE catalog of each backend
// (Vercel Gateway for "private"/ZDR models, Phala for "confidential"/TEE ones),
// so we never advertise a model a backend can't serve. Each is annotated with
// the CHARGED price (base × per-model margin), context window, and privacy tier.
export async function GET(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) {
    return auth.response;
  }

  const [gatewayPricing, phalaPricing] = await Promise.all([
    getModelPricing(),
    getPhalaPricing(),
  ]);
  const created = Math.floor(Date.now() / 1000);

  const data = apiModels.flatMap((m) => {
    const base =
      m.privacy === "confidential" ? phalaPricing[m.id] : gatewayPricing[m.id];
    if (!base) {
      return [];
    }
    const margin = apiMarginFor(m.id);
    return [
      {
        id: m.id,
        object: "model" as const,
        created,
        owned_by: m.id.split("/")[0],
        // Additive (non-standard) fields — like OpenRouter; OpenAI SDKs ignore them.
        name: m.name,
        tier: m.tier,
        privacy: m.privacy,
        context_window: base.contextWindow ?? null,
        pricing: {
          // USD per 1M tokens, CHARGED (what debits credit) — what you see = what you pay.
          input_per_1m: base.inputPer1M * margin,
          output_per_1m: base.outputPer1M * margin,
        },
      },
    ];
  });

  return Response.json({ object: "list", data });
}
