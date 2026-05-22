import { createGateway, customProvider } from "ai";
import { isTestEnvironment } from "../constants";
import { env } from "../env";
import { titleModel } from "./models";

/**
 * Explicit AI Gateway provider, configured against the typed env proxy.
 *
 * S.250 P2 #3 — closes the env-proxy drift the S.248 audit flagged for the
 * chat-title.ts flow. The default `gateway` export from the AI SDK reads
 * `process.env.AI_GATEWAY_API_KEY` internally at call time, bypassing our
 * env-validation-gate (which throws at boot on misconfig). Switching to an
 * explicit `createGateway({ apiKey: env.AI_GATEWAY_API_KEY })` here means
 * EVERY gateway-backed model call (chat stream + title gen + future eval
 * harness) goes through the boot-validated value, not a runtime
 * `process.env` read. When the env var is unset, `createGateway` falls back
 * to the SDK's own env lookup (same behaviour as the default export) — but
 * the call site documents the dependency.
 *
 * See `.cursor/rules/env-validation-gate.mdc` (cross-app standard) +
 * `lib/env.ts` line ~64 for the AI_GATEWAY_API_KEY contract.
 */
const audricGateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  return audricGateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return audricGateway.languageModel(titleModel.id);
}
