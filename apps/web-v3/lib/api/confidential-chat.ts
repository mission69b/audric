import "server-only";

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
  streamText,
} from "ai";
import { after } from "next/server";
import { anchorAndStore } from "@/lib/api/anchor";
import { apiMarginFor } from "@/lib/api/models";
import { getInferenceModel, getPhalaPricing } from "@/lib/api/providers";
import { debitMicrosForUsage } from "@/lib/credit/meter";
import {
  recordCredit,
  saveMessages,
  updateChatTitleById,
} from "@/lib/db/queries";
import { isCreditConfigured } from "@/lib/stripe";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

// Fast default when the user hasn't picked a specific confidential model.
const DEFAULT_CONFIDENTIAL_MODEL = "phala/gpt-oss-120b";

// Confidential mode is a PURE in-TEE completion — deliberately NO tools /
// web-search / artifacts / memory. Any of those would send data OUT of the
// enclave (a web query, a tool result) and break the confidentiality guarantee
// the 🔒 badge makes (SPEC_CONFIDENTIAL_UI §6/§7 — never overclaim). The full
// agentic Audric experience is the normal (Private/ZDR) mode.
const CONFIDENTIAL_SYSTEM =
  "You are Audric in Confidential mode, running inside a GPU-TEE (a hardware-isolated enclave). Answer directly and helpfully. In this mode you have no tools, web access, or memory — that is intentional: it keeps the entire exchange sealed inside the enclave so it stays provably private. If the user asks for live or current information (news, prices, schedules, sports, anything that needs the web), don't just say you have no internet — briefly explain that Confidential mode can't fetch live data to stay sealed, and suggest they turn Confidential off to use web search. Then still help as much as you can from what you already know.";

/**
 * Confidential chat turn — a pure GPU-TEE completion streamed back to the in-app
 * chat. Routes through Phala (`getInferenceModel`), captures the signed receipt
 * id from the response headers, persists it as a `data-confidential` message
 * part (so the 🔒 badge + Verify survive a reload — message metadata isn't
 * persisted), and anchors every response on Sui async (zero added latency).
 */
export function confidentialChatResponse(opts: {
  chatId: string;
  userId?: string;
  modelMessages: ModelMessage[];
  requestedModelId: string;
  // Set for a NEW chat — resolve it + stamp the sidebar title (the agentic path
  // does this; the confidential branch must too, or chats stay "New chat").
  titlePromise?: Promise<string> | null;
}): Response {
  const modelId = opts.requestedModelId.startsWith("phala/")
    ? opts.requestedModelId
    : DEFAULT_CONFIDENTIAL_MODEL;
  const turnStartedAt = new Date().toISOString();
  let receiptId: string | undefined;

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      const result = streamText({
        model: getInferenceModel(modelId),
        system: CONFIDENTIAL_SYSTEM,
        messages: opts.modelMessages,
      });
      writer.merge(
        result.toUIMessageStream({
          sendReasoning: true,
          messageMetadata: ({ part }) => {
            // `confidential` at start → the 🔒 badge lights up immediately.
            if (part.type === "start") {
              return { createdAt: turnStartedAt, modelId, confidential: true };
            }
            if (part.type === "finish") {
              const u = part.totalUsage;
              return {
                createdAt: turnStartedAt,
                modelId,
                confidential: true,
                receiptId,
                inputTokens: u?.inputTokens,
                outputTokens: u?.outputTokens,
                totalTokens: u?.totalTokens,
              };
            }
            return;
          },
        })
      );
      // The signed-receipt id rides the confidential response headers. Persist
      // it as a data part (survives reload) + anchor-every on Sui, async.
      const resp = await result.response;
      const rid = resp?.headers?.["x-receipt-id"];
      if (typeof rid === "string" && rid) {
        receiptId = rid;
        writer.write({
          type: "data-confidential",
          data: { receiptId: rid, modelId },
        });
        after(() => anchorAndStore(rid));
      }
      // New chat → resolve + stream the generated title so the sidebar updates
      // live (mirrors the agentic path; else confidential chats stay "New chat").
      if (opts.titlePromise) {
        try {
          const title = await opts.titlePromise;
          writer.write({ type: "data-chat-title", data: title });
          await updateChatTitleById({ chatId: opts.chatId, title });
        } catch {
          // non-fatal — the chat just keeps its placeholder title
        }
      }
    },
    generateId: generateUUID,
    onError: () => "The confidential model is temporarily unavailable.",
    onEnd: async ({ messages }) => {
      if (!opts.userId || messages.length === 0) {
        return;
      }
      await saveMessages({
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: m.parts,
          createdAt: new Date(),
          attachments: [],
          chatId: opts.chatId,
        })),
      });
      // Meter at the CONFIDENTIAL tier — Phala per-token pricing × the 2.0×
      // confidential margin. ref = message id → idempotent. Inert when the
      // credit rail isn't configured.
      if (!isCreditConfigured()) {
        return;
      }
      const pricing = (await getPhalaPricing())[modelId];
      const margin = apiMarginFor(modelId);
      for (const m of messages) {
        if (m.role !== "assistant") {
          continue;
        }
        const meta = m.metadata;
        if (!meta?.totalTokens) {
          continue;
        }
        const debit = debitMicrosForUsage(
          { inputTokens: meta.inputTokens, outputTokens: meta.outputTokens },
          pricing,
          margin
        );
        if (debit > 0) {
          await recordCredit({
            userId: opts.userId,
            amountMicros: -debit,
            type: "debit",
            description: `${modelId} · confidential · ${meta.inputTokens ?? 0}+${meta.outputTokens ?? 0} tok`,
            ref: m.id,
          });
        }
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
