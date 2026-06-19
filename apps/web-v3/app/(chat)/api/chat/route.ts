import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  allowedModelIds,
  chatModels,
  DEFAULT_CHAT_MODEL,
  getCapabilities,
  getModelPricing,
} from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { balanceCheck } from "@/lib/ai/tools/balance-check";
import { createDocument } from "@/lib/ai/tools/create-document";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { resolveSuins } from "@/lib/ai/tools/resolve-suins";
import { runRecipeTool } from "@/lib/ai/tools/run-recipe";
import { saveMemory } from "@/lib/ai/tools/save-memory";
import { sendTransfer } from "@/lib/ai/tools/send-transfer";
import { transactionHistory } from "@/lib/ai/tools/transaction-history";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { webSearch } from "@/lib/ai/tools/web-search";
import { isProductionEnvironment } from "@/lib/constants";
import { debitMicrosForUsage } from "@/lib/credit/meter";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getCreditBalanceMicros,
  getMessageCountByUserId,
  getMessagesByChatId,
  recordCredit,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { isMemoryConfigured, withUserMemory } from "@/lib/memwal";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { isCreditConfigured, maybeAutoRecharge } from "@/lib/stripe";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

// Web-search-grounded turns can run 60–120s (search + synthesis). 60s would be
// killed mid-stream in prod — raise to 300s (Vercel Fluid compute / Pro; Hobby
// caps at 60s so deep-research turns need a paid tier). Genuinely long async
// work (video gen, multi-step Recipes) graduates to Vercel Workflows in 4b.
export const maxDuration = 300;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      messages,
      selectedChatModel,
      selectedVisibilityType,
      useMemWal,
    } = requestBody;

    const [, session] = await Promise.all([
      checkBotId().catch(() => null),
      auth(),
    ]);

    // Anonymous "try-before-signup" is allowed: no session => free-model-only,
    // no server persistence. Premium models + saved history require sign-in.
    const requestedModel = allowedModelIds.has(selectedChatModel)
      ? selectedChatModel
      : DEFAULT_CHAT_MODEL;
    const requestedIsFree =
      chatModels.find((m) => m.id === requestedModel)?.free === true;
    const chatModel =
      session?.user || requestedIsFree ? requestedModel : DEFAULT_CHAT_MODEL;

    // IP rate-limit applies to everyone — the anonymous-abuse guard.
    await checkIpRateLimit(ipAddress(request));

    const isToolApprovalFlow = Boolean(messages);
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    // Per-user cap + persistence are authed-only; anonymous chats are
    // client-side/ephemeral (sign in to save them).
    if (session?.user) {
      const userType: UserType = session.user.type;
      const messageCount = await getMessageCountByUserId({
        id: session.user.id,
        differenceInHours: 1,
      });
      if (messageCount > entitlementsByUserType[userType].maxMessagesPerHour) {
        return new ChatbotError("rate_limit:chat").toResponse();
      }

      const chat = await getChatById({ id });
      if (chat) {
        if (chat.userId !== session.user.id) {
          return new ChatbotError("forbidden:chat").toResponse();
        }
        messagesFromDb = await getMessagesByChatId({ id });
      } else if (message?.role === "user") {
        await saveChat({
          id,
          userId: session.user.id,
          title: "New chat",
          visibility: selectedVisibilityType,
        });
        titlePromise = generateTitleFromUserMessage({ message });
      }
    }

    let uiMessages: ChatMessage[];

    if (isToolApprovalFlow && messages) {
      const dbMessages = convertToUIMessages(messagesFromDb);
      const approvalStates = new Map(
        messages.flatMap(
          (m) =>
            m.parts
              ?.filter(
                (p: Record<string, unknown>) =>
                  p.state === "approval-responded" ||
                  p.state === "output-denied" ||
                  // Client-executed tools (send_transfer, run_recipe) produce
                  // their result in the
                  // browser; trust the client-provided output on continuation so
                  // the agent can narrate it. Safe here — the user paid from
                  // their OWN Passport; no other party is exposed.
                  p.state === "output-available" ||
                  p.state === "output-error"
              )
              .map((p: Record<string, unknown>) => [
                String(p.toolCallId ?? ""),
                p,
              ]) ?? []
        )
      );
      uiMessages = dbMessages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (
            "toolCallId" in part &&
            approvalStates.has(String(part.toolCallId))
          ) {
            return { ...part, ...approvalStates.get(String(part.toolCallId)) };
          }
          return part;
        }),
      })) as ChatMessage[];
    } else {
      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        message as ChatMessage,
      ];
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (session?.user && message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    // Private Memory: opt-in (useMemWal), authed-only, and only when the Audric
    // MemWal account creds are configured. When on, the model is wrapped for
    // recall + the save_memory tool is offered.
    const memoryOn = Boolean(
      session?.user && useMemWal && isMemoryConfigured()
    );

    const modelConfig = chatModels.find((m) => m.id === chatModel);

    // Credit gate (Phase 5): premium (non-free) models are metered against the
    // credit balance. When the credit rail is live and the user is out of
    // credit, block premium with a clear top-up prompt — the free model (Kimi)
    // always works. Inert when Stripe isn't configured (premium stays free).
    const isPremiumModel = modelConfig?.free !== true;
    if (session?.user && isPremiumModel && isCreditConfigured()) {
      const balance = await getCreditBalanceMicros(session.user.id);
      if (balance <= 0) {
        return new ChatbotError("bad_request:credit").toResponse();
      }
    }

    const modelCapabilities = await getCapabilities();
    const capabilities = modelCapabilities[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;
    const supportsTools = capabilities?.tools === true;

    const modelMessages = await convertToModelMessages(uiMessages);

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const baseModel = getLanguageModel(chatModel);
        const result = streamText({
          model:
            memoryOn && session?.user
              ? withUserMemory(baseModel, session.user.id)
              : baseModel,
          system: systemPrompt({
            requestHints,
            supportsTools,
            isAuthed: Boolean(session?.user),
            memoryOn,
          }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools:
            isReasoningModel && !supportsTools
              ? []
              : session?.user
                ? [
                    "web_search",
                    "createDocument",
                    "editDocument",
                    "updateDocument",
                    "requestSuggestions",
                    "balance_check",
                    "transaction_history",
                    "resolve_suins",
                    "send_transfer",
                    "run_recipe",
                    ...(memoryOn ? ["save_memory" as const] : []),
                  ]
                : ["web_search", "createDocument"],
          providerOptions: {
            ...(modelConfig?.gatewayOrder && {
              gateway: { order: modelConfig.gatewayOrder },
            }),
            ...(modelConfig?.reasoningEffort && {
              openai: { reasoningEffort: modelConfig.reasoningEffort },
            }),
          },
          // createDocument works for everyone (incl. anonymous free-trial):
          // the artifact renders live from the stream, and persistence
          // auto-skips when there's no account (server.ts guards on
          // session?.user?.id). The refine tools (edit/update/suggestions) read
          // the doc back from the DB, so they require a persisted doc → authed.
          // (getWeather was template demo cruft — removed; real §8 tools land in
          // Phase 4.)
          tools: {
            // Web search via an SDK-executed custom tool (Sonar through the
            // Gateway). SDK-executed (not the provider tool) so the multi-step
            // loop continues → the model actually synthesizes the answer. The
            // standard provider-executed gateway tools (perplexitySearch AND
            // parallelSearch) were both verified to NOT synthesize on our
            // open-model roster (S.478 A/B). Available to everyone (incl. anon).
            web_search: webSearch,
            createDocument: createDocument({
              session,
              dataStream,
              modelId: chatModel,
            }),
            ...(session?.user
              ? {
                  editDocument: editDocument({ dataStream, session }),
                  updateDocument: updateDocument({
                    session,
                    dataStream,
                    modelId: chatModel,
                  }),
                  requestSuggestions: requestSuggestions({
                    session,
                    dataStream,
                    modelId: chatModel,
                  }),
                  // Wallet tools (money path) — authed-only. session.user.id is
                  // the zkLogin Sui address. send_transfer is client-executed
                  // (no execute here) — the browser signs on tap-to-confirm.
                  balance_check: balanceCheck({ address: session.user.id }),
                  transaction_history: transactionHistory({
                    address: session.user.id,
                  }),
                  resolve_suins: resolveSuins,
                  send_transfer: sendTransfer,
                  // Recipes (Phase 4b) — client-executed multi-service paid
                  // flows; the browser signs each x402 call on confirm.
                  run_recipe: runRecipeTool,
                  // Private Memory (§7c) — explicit capture; only when the user
                  // has memory ON this turn. Recall is automatic (model wrap).
                  ...(memoryOn
                    ? { save_memory: saveMemory({ address: session.user.id }) }
                    : {}),
                }
              : {}),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
          onError: ({ error }) => {
            console.error("[streamText onError]", error);
          },
        });

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: isReasoningModel,
            sendSources: true,
            // Stamp per-turn token usage onto the assistant message so the
            // client can render the ambient Context usage card. Not persisted
            // (no metadata column) — it's a "this turn" indicator.
            messageMetadata: ({ part }) => {
              if (part.type === "start") {
                return {
                  createdAt: new Date().toISOString(),
                  modelId: chatModel,
                };
              }
              if (part.type === "finish") {
                const u = part.totalUsage;
                return {
                  createdAt: new Date().toISOString(),
                  modelId: chatModel,
                  inputTokens: u?.inputTokens,
                  outputTokens: u?.outputTokens,
                  totalTokens: u?.totalTokens,
                  reasoningTokens:
                    u?.reasoningTokens ??
                    u?.outputTokenDetails?.reasoningTokens,
                  cachedInputTokens:
                    u?.cachedInputTokens ??
                    u?.inputTokenDetails?.cacheReadTokens,
                };
              }
              return;
            },
          })
        );

        if (titlePromise) {
          try {
            const title = await titlePromise;
            dataStream.write({ type: "data-chat-title", data: title });
            updateChatTitleById({ chatId: id, title });
          } catch (_) {
            /* non-fatal */
          }
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        // Anonymous chats aren't persisted (no account to attach them to).
        if (!session?.user) {
          return;
        }
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }

        // Meter premium-model usage against the credit balance (Phase 5). The
        // free model debits nothing. ref = message id → idempotent (one debit
        // per assistant turn, even if onFinish ever re-fires). Inert when the
        // credit rail isn't configured.
        if (isPremiumModel && isCreditConfigured()) {
          const pricing = (await getModelPricing())[chatModel];
          for (const m of finishedMessages) {
            if (m.role !== "assistant") {
              continue;
            }
            const meta = m.metadata as
              | {
                  totalTokens?: number;
                  inputTokens?: number;
                  outputTokens?: number;
                }
              | undefined;
            if (!meta?.totalTokens) {
              continue;
            }
            const debit = debitMicrosForUsage(
              {
                inputTokens: meta.inputTokens,
                outputTokens: meta.outputTokens,
              },
              pricing
            );
            if (debit > 0) {
              await recordCredit({
                userId: session.user.id,
                amountMicros: -debit,
                type: "debit",
                description: `${chatModel} · ${meta.inputTokens ?? 0}+${meta.outputTokens ?? 0} tok`,
                ref: m.id,
              });
            }
          }
          // Top the card back up if this debit dropped them below threshold.
          await maybeAutoRecharge(session.user.id);
        }
      },
      onError: (error) => {
        console.error("[chat onError]", error);
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "The AI service is temporarily unavailable. Please try again shortly.";
        }
        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        // Resumable streams persist per-chat; skip for anonymous (no chat row).
        if (!session?.user || !process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          /* non-critical */
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
