import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { balanceCheck } from "./ai/tools/balance-check";
import type { createDocument } from "./ai/tools/create-document";
import type { cryptoHistory } from "./ai/tools/crypto-history";
import type { cryptoMarket } from "./ai/tools/crypto-market";
import type { editImage } from "./ai/tools/edit-image";
import type { generateImage } from "./ai/tools/generate-image";
import type { generateVideo } from "./ai/tools/generate-video";
import type { imageSearch } from "./ai/tools/image-search";
import type { perpMarket } from "./ai/tools/perp-market";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { resolveSuins } from "./ai/tools/resolve-suins";
import type { saveMemory } from "./ai/tools/save-memory";
import type { sendTransfer } from "./ai/tools/send-transfer";
import type { stockAnalysis } from "./ai/tools/stock-analysis";
import type { transactionHistory } from "./ai/tools/transaction-history";
import type { updateDocument } from "./ai/tools/update-document";
import type { upscaleImage } from "./ai/tools/upscale-image";
import type { webSearch } from "./ai/tools/web-search";
import type { Suggestion } from "./db/schema";

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
  // Per-turn usage (attached at stream finish) → powers the ambient Context
  // usage card. All optional: only the live/just-finished turn carries them
  // (not persisted), so historical messages simply omit the card.
  modelId: z.string().optional(),
  // True when the model was chosen by the "Auto" router this turn (drives the
  // "Auto · <model>" badge so the routing intelligence is visible).
  autoRouted: z.boolean().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
  // Confidential mode (GPU-TEE): set at stream start so the 🔒 badge shows
  // immediately. The verifiable receipt id arrives at finish (also persisted as
  // a `data-confidential` part so the badge + Verify survive a reload).
  confidential: z.boolean().optional(),
  receiptId: z.string().optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type webSearchTool = InferUITool<typeof webSearch>;
type imageSearchTool = InferUITool<typeof imageSearch>;
type balanceCheckTool = InferUITool<ReturnType<typeof balanceCheck>>;
type transactionHistoryTool = InferUITool<
  ReturnType<typeof transactionHistory>
>;
type resolveSuinsTool = InferUITool<typeof resolveSuins>;
type sendTransferTool = InferUITool<typeof sendTransfer>;
type saveMemoryTool = InferUITool<ReturnType<typeof saveMemory>>;
type generateImageTool = InferUITool<ReturnType<typeof generateImage>>;
type editImageTool = InferUITool<ReturnType<typeof editImage>>;
type upscaleImageTool = InferUITool<ReturnType<typeof upscaleImage>>;
type generateVideoTool = InferUITool<ReturnType<typeof generateVideo>>;
type perpMarketTool = InferUITool<typeof perpMarket>;
type cryptoMarketTool = InferUITool<typeof cryptoMarket>;
type cryptoHistoryTool = InferUITool<typeof cryptoHistory>;
type stockAnalysisTool = InferUITool<typeof stockAnalysis>;

export type ChatTools = {
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  generate_image: generateImageTool;
  edit_image: editImageTool;
  upscale_image: upscaleImageTool;
  generate_video: generateVideoTool;
  perp_market: perpMarketTool;
  crypto_market: cryptoMarketTool;
  crypto_history: cryptoHistoryTool;
  stock_analysis: stockAnalysisTool;
  requestSuggestions: requestSuggestionsTool;
  web_search: webSearchTool;
  image_search: imageSearchTool;
  balance_check: balanceCheckTool;
  transaction_history: transactionHistoryTool;
  resolve_suins: resolveSuinsTool;
  send_transfer: sendTransferTool;
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
  // A PDF attachment was extracted to text server-side (before the model ran) →
  // surfaced as a "Parsed <name>" step at the top of the turn's CoT timeline.
  "parsed-file": { name: string };
  // Confidential (GPU-TEE) response receipt — carried as a persisted message
  // part so the 🔒 badge + Verify work forever (metadata isn't persisted).
  confidential: { receiptId: string; modelId: string };
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
