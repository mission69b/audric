import { gateway } from "ai";

// The provider seam — the ONE place the model backend is chosen, mirroring
// web-v3's `lib/ai/providers.ts` (`getLanguageModel` → `gateway.languageModel`).
// The route, transport, and UI never reference a provider directly; swapping the
// backend is a change to this file alone.
//
// Backend: the Vercel AI Gateway — same `ai` package and same contract as web-v3.
// The key is read SERVER-SIDE only (`AI_GATEWAY_API_KEY`, deliberately WITHOUT the
// `EXPO_PUBLIC_` prefix) so Metro never inlines it into the client bundle. Requests
// are proxied through the Expo Router API route (`app/api/chat+api.ts`); the key
// never reaches the device.

// web-v3's default free model (`lib/ai/models.ts` DEFAULT_CHAT_MODEL). Never metered.
export const DEFAULT_MODEL_ID = "moonshotai/kimi-k2.5";

// Returns the language model for a turn. The client sends canonical gateway ids
// (see `app-state/catalog.ts`, mirrored from web-v3 `lib/ai/models.ts`). "auto" is
// web-v3's router pseudo-id; mobile has no router yet, so it resolves to the free
// default. NOTE: paid ids bill the gateway key — web-v3's entitlement/metering gate
// is not ported to this route yet (see the BEFORE DEPLOY note in `chat+api.ts`).
export function getLanguageModel(modelId?: string) {
  if (!modelId || modelId === "auto") {
    return gateway.languageModel(DEFAULT_MODEL_ID);
  }
  return gateway.languageModel(modelId);
}
