import { getModelPricing } from "@/lib/ai/models";
import { apiMarginFor, apiModels } from "@/lib/api/models";
import { getPhalaPricing } from "@/lib/api/providers";
import {
  ROUTER_BULK_MODEL,
  ROUTER_FRONTIER_MODEL,
  ROUTER_OPEN_ESCALATION_MODEL,
} from "@/lib/api/router";

// GET /v1/models — OpenAI-compatible catalog (SPEC_AUDRIC_API v1/v1.5). Returns
// the intersection of our curated set with the LIVE catalog of each backend
// (Vercel Gateway for "private"/ZDR models, Phala for "confidential"/TEE ones),
// so we never advertise a model a backend can't serve. Each is annotated with
// the CHARGED price (base × per-model margin), context window, and privacy tier.
//
// PUBLIC (no key) — a model + pricing catalog is public info (every AI gateway
// exposes one), and the console (agents.t2000.ai/manage) renders it for browsing
// before a dev has a key. The OpenAI SDK's models.list() still works (it sends
// the key, which is simply ignored here). The completions endpoint stays gated.
export async function GET() {
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
        reasoning: m.reasoning ?? false,
        context_window: base.contextWindow ?? null,
        pricing: {
          // USD per 1M tokens, CHARGED (what debits credit) — what you see = what you pay.
          input_per_1m: base.inputPer1M * margin,
          output_per_1m: base.outputPer1M * margin,
        },
      },
    ];
  });

  // The t2000/auto router ids (SPEC_INFERENCE_DEMAND §2b) — virtual models
  // that resolve per request. Priced at the BULK model's charged rate (what
  // ~70–80% of requests cost); billing always follows the model that actually
  // served (`x-t2000-served-model`). Listed only when the bulk model is live.
  const bulkBase = gatewayPricing[ROUTER_BULK_MODEL];
  if (bulkBase) {
    const bulkMargin = apiMarginFor(ROUTER_BULK_MODEL);
    const routerPricing = {
      input_per_1m: bulkBase.inputPer1M * bulkMargin,
      output_per_1m: bulkBase.outputPer1M * bulkMargin,
    };
    const routerEntry = (id: string, name: string, escalatesTo: string) => ({
      id,
      object: "model" as const,
      created,
      owned_by: "t2000",
      name,
      tier: "open" as const,
      privacy: "private" as const,
      reasoning: false,
      context_window: bulkBase.contextWindow ?? null,
      // Additive fields (OpenAI SDKs ignore them):
      router: true,
      routes_to: { bulk: ROUTER_BULK_MODEL, escalation: escalatesTo },
      pricing: routerPricing,
    });
    data.push(
      routerEntry(
        "t2000/auto",
        "t2000 Auto — coding router (open, frontier escalation)",
        ROUTER_FRONTIER_MODEL
      ),
      routerEntry(
        "t2000/auto-open",
        "t2000 Auto Open — coding router (never leaves open models)",
        ROUTER_OPEN_ESCALATION_MODEL
      )
    );
  }

  return Response.json({ object: "list", data });
}
