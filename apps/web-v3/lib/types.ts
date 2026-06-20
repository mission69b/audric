import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { balanceCheck } from "./ai/tools/balance-check";
import type { createDocument } from "./ai/tools/create-document";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { resolveSuins } from "./ai/tools/resolve-suins";
import type { runRecipeTool } from "./ai/tools/run-recipe";
import type { saveMemory } from "./ai/tools/save-memory";
import type { sendTransfer } from "./ai/tools/send-transfer";
import type { transactionHistory } from "./ai/tools/transaction-history";
import type { updateDocument } from "./ai/tools/update-document";
import type { webSearch } from "./ai/tools/web-search";
import type { Suggestion } from "./db/schema";

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
  // Per-turn usage (attached at stream finish) → powers the ambient Context
  // usage card. All optional: only the live/just-finished turn carries them
  // (not persisted), so historical messages simply omit the card.
  modelId: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type webSearchTool = InferUITool<typeof webSearch>;
type balanceCheckTool = InferUITool<ReturnType<typeof balanceCheck>>;
type transactionHistoryTool = InferUITool<
  ReturnType<typeof transactionHistory>
>;
type resolveSuinsTool = InferUITool<typeof resolveSuins>;
type sendTransferTool = InferUITool<typeof sendTransfer>;
type runRecipeToolType = InferUITool<typeof runRecipeTool>;
type saveMemoryTool = InferUITool<ReturnType<typeof saveMemory>>;

export type ChatTools = {
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  web_search: webSearchTool;
  balance_check: balanceCheckTool;
  transaction_history: transactionHistoryTool;
  resolve_suins: resolveSuinsTool;
  send_transfer: sendTransferTool;
  run_recipe: runRecipeToolType;
  save_memory: saveMemoryTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
  // Confidential (TEE) turn → the client lazily fetches the TEE-signed receipt
  // for this response id from /api/tee/receipt and renders the verified badge.
  "tee-receipt": { responseId: string; model: string };
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
