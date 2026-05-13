import { buildTool } from '@t2000/engine';
import { z } from 'zod';

/**
 * SPEC 23B-MPP6 UX polish followup — Audric-side mpp_services override.
 *
 * Why this lives in audric, not in `@t2000/engine`:
 *
 * The engine's `mpp_services` tool returns the FULL gateway catalog
 * (~40 services across 7 categories). The CLI / generic engine
 * consumers want this — they may use any service the gateway hosts.
 *
 * Audric is the deliberate exception. The system prompt teaches the
 * LLM to use ONLY OpenAI's 4 endpoints (image generation via gpt-image-1,
 * Whisper transcription, GPT-4o chat, TTS) and decline everything else as
 * "coming soon via dedicated tools" — see `spec_native_content_tools`
 * for the planned PDF / postcard / email replacements.
 *
 * Founder smoke 2026-05-12 (round 2) explicitly requested stripping
 * the catalog further: "Might aswell remove elevenlabs also just keep
 * openai for Images, whisper transcription and gpt 4o chat , text to
 * speech. I think simple is better no? less is more." ElevenLabs was
 * also broken at the gateway (payment-charged-but-service-failed)
 * which made the second-tier vendor option a UX trap.
 *
 * Round 1 (2026-05-12 morning): allow-list was {openai, elevenlabs,
 * pdfshift, lob, resend} — 5 services. Round 2 (founder direct
 * request, this commit): collapsed to {openai} only. spec_native_
 * content_tools will add native compose_pdf / send_letter / send_email
 * tools to replace pdfshift / lob / resend with deterministic
 * Audric-owned tools that don't need the discover-services card
 * (they'll surface as regular tools in the LLM's tool list).
 *
 * If we add a 6th service (e.g. Suno when Phase 5 lands), update
 * both this file AND the system prompt — they MUST stay in sync.
 *
 * Behavioral preservation: input schema, output shape, error paths,
 * and 0-result `_refine` payload are all UNCHANGED from the engine's
 * version. Only the catalog set is narrowed. CLI / engine consumers
 * outside audric continue to see the full catalog because audric is
 * the only host that registers this override.
 */

const MPP_GATEWAY = 'https://mpp.t2000.ai';
const CATALOG_URL = `${MPP_GATEWAY}/api/services`;
const CACHE_TTL = 120_000;

// [Round 2 / 2026-05-12] OpenAI-only. ElevenLabs / PDFShift / Lob /
// Resend stripped per founder direct request — see header for the
// rationale + spec_native_content_tools migration plan.
const SUPPORTED_SERVICE_IDS = new Set(['openai']);

interface GatewayEndpoint {
  method: string;
  path: string;
  description: string;
  price: string;
}

interface GatewayService {
  id: string;
  name: string;
  serviceUrl: string;
  description: string;
  categories: string[];
  endpoints: GatewayEndpoint[];
}

let catalogCache: { data: GatewayService[]; ts: number } | null = null;

async function fetchAudricCatalog(): Promise<GatewayService[]> {
  if (catalogCache && Date.now() - catalogCache.ts < CACHE_TTL) {
    return catalogCache.data;
  }
  const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`MPP catalog fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as GatewayService[];
  const filtered = data.filter((s) => SUPPORTED_SERVICE_IDS.has(s.id));
  catalogCache = { data: filtered, ts: Date.now() };
  return filtered;
}

function renderServices(catalog: GatewayService[]) {
  return catalog.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    categories: s.categories,
    endpoints: s.endpoints.map((e) => ({
      url: `${MPP_GATEWAY}/${s.id}${e.path}`,
      method: e.method,
      description: e.description,
      price: `$${e.price}`,
    })),
  }));
}

function matchesQuery(service: GatewayService, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    service.id.toLowerCase().includes(lower) ||
    service.name.toLowerCase().includes(lower) ||
    service.description.toLowerCase().includes(lower) ||
    service.categories.some((c) => c.toLowerCase().includes(lower)) ||
    service.endpoints.some((e) => e.description.toLowerCase().includes(lower))
  );
}

export const audricMppServicesTool = buildTool({
  name: 'mpp_services',
  description:
    'Discover available MPP gateway services. Returns service names, descriptions, endpoints with required parameters, and pricing. Use BEFORE calling pay_api. Audric currently supports OpenAI only (image generation via gpt-image-1, Whisper transcription, GPT-4o chat, TTS). With no args, returns the OpenAI service catalog as a single card. Use `query` to keyword-search ("voice", "image", "transcribe"). Use `category` to filter (only "ai" today). Use `mode: "summary"` only if you want a category-counts overview without the full list.',
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe('Filter by keyword (e.g. "postcard", "voice", "pdf").'),
    category: z
      .string()
      .optional()
      .describe('Filter by category exactly. Use mode:"summary" first if you need to see the category list.'),
    mode: z
      .enum(['summary', 'full'])
      .optional()
      .describe('"full" (default) returns the full Audric-supported catalog. "summary" returns category counts only.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Filter by keyword.' },
      category: { type: 'string', description: 'Filter by category exactly.' },
      mode: {
        type: 'string',
        enum: ['summary', 'full'],
        description: '"full" (default) returns the full Audric-supported catalog. "summary" returns category counts only.',
      },
    },
    required: [],
  },
  isReadOnly: true,
  maxResultSizeChars: 12_000,

  async call(input): Promise<{ data: Record<string, unknown>; displayText: string }> {
    const catalog = await fetchAudricCatalog();

    if (input.mode !== 'summary' && !input.query && !input.category) {
      const services = renderServices(catalog);
      return {
        data: { services, total: services.length, mode: 'full' },
        displayText: `Audric-supported MPP catalog: ${services.length} services.`,
      };
    }

    if (input.mode === 'summary' && !input.query && !input.category) {
      const counts = new Map<string, number>();
      for (const svc of catalog) {
        for (const cat of svc.categories) {
          counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
      }
      const categories = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, services]) => ({ category, services }));
      return {
        data: {
          _refine: {
            reason: 'Category summary (mode:"summary"). Re-call with a category or omit mode for the full catalog.',
            suggestedParams: { category: categories[0]?.category ?? 'image' },
            allModes: ['summary', 'full'],
          },
          categories,
          totalServices: catalog.length,
        },
        displayText: `${catalog.length} services across ${categories.length} categories.`,
      };
    }

    let filtered = catalog;
    if (input.category) {
      const cat = input.category.toLowerCase();
      filtered = filtered.filter((s) => s.categories.some((c) => c.toLowerCase() === cat));
    }
    if (input.query) {
      filtered = filtered.filter((s) => matchesQuery(s, input.query!));
    }

    const services = renderServices(filtered);

    const filterDesc = [
      input.query ? `query "${input.query}"` : null,
      input.category ? `category "${input.category}"` : null,
    ].filter(Boolean).join(' + ');

    if (services.length === 0 && (input.category || input.query)) {
      const validCategories = [
        ...new Set(catalog.flatMap((s) => s.categories.map((c) => c.toLowerCase()))),
      ].sort();
      return {
        data: {
          services: [],
          total: 0,
          _refine: {
            reason:
              input.category && !catalog.some((s) =>
                s.categories.some((c) => c.toLowerCase() === input.category!.toLowerCase())
              )
                ? `Category "${input.category}" not in the Audric-supported catalog.`
                : `No supported services match the supplied filter (${filterDesc}).`,
            validCategories,
            suggestion:
              'Re-call mpp_services with no arguments to see the full Audric-supported catalog (5 services), or pick a category from validCategories. If the user asked for something Audric doesn\'t support (music pre-Phase-5, web search, news, weather, translation, maps, etc.), decline honestly per the system prompt § MPP services block.',
          },
        },
        displayText: `Found 0 supported service(s) matching ${filterDesc}. Valid categories: ${validCategories.join(', ')}.`,
      };
    }

    const summary = `Found ${services.length} service(s) matching ${filterDesc}`;

    return {
      data: { services, total: services.length },
      displayText: summary,
    };
  },
});
