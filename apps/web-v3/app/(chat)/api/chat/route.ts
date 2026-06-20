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
import { maxMessagesPerHour } from "@/lib/ai/entitlements";
import { inlineImageAttachments } from "@/lib/ai/inline-attachments";
import { routeTurn } from "@/lib/ai/intelligence/router";
import {
  AUTO_MODEL_ID,
  allChatModels,
  allowedModelIds,
  chatModels,
  DEFAULT_CHAT_MODEL,
  getCapabilities,
  getModelPricing,
  isConfidentialModel,
} from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import {
  getConfidentialCatalog,
  getLanguageModel,
  isConfidentialConfigured,
} from "@/lib/ai/providers";
import {
  ensureGeminiThoughtSignatures,
  isGemini3,
} from "@/lib/ai/thought-signatures";
import { askUser } from "@/lib/ai/tools/ask-user";
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
  getUserById,
  recordCredit,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { isMemoryConfigured, recallMemoryBlock } from "@/lib/memwal";
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

type ActiveTool =
  | "web_search"
  | "ask_user"
  | "createDocument"
  | "editDocument"
  | "updateDocument"
  | "requestSuggestions"
  | "balance_check"
  | "transaction_history"
  | "resolve_suins"
  | "send_transfer"
  | "run_recipe"
  | "save_memory";

// Artifact tools that WRITE/replace a document. A single createDocument already
// streams the COMPLETE artifact, so once any of these has run in a turn we drop
// them all from the active set — structurally preventing the duplicate-artifact
// class (a model chaining createDocument → updateDocument) on EVERY model,
// rather than relying on prompt/tool-result wording per model.
const DOC_MUTATION_TOOLS = new Set<ActiveTool>([
  "createDocument",
  "updateDocument",
  "editDocument",
  "requestSuggestions",
]);

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

    // Turn start — stamped ONCE here (server receive, ≈ user send) and reused for
    // the assistant message's createdAt on BOTH start and finish, so it's never
    // clobbered to the finish time. Drives the chain-of-thought "Thought for Xs"
    // timer — anchored to the true turn start (incl. routing + model TTFT), so it
    // reflects wall-clock, not just the visible streaming window.
    const turnStartedAt = new Date().toISOString();

    const [, session] = await Promise.all([
      checkBotId().catch(() => null),
      auth(),
    ]);

    // Fetch the account once up front — the tier drives BOTH the Confidential
    // gate (below) and the hourly cap (further down). Guests/anon have no row →
    // treated as free.
    const dbUser =
      session?.user && session.user.type !== "guest"
        ? await getUserById(session.user.id)
        : null;
    const isPaidTier =
      dbUser?.subscriptionTier === "pro" || dbUser?.subscriptionTier === "max";

    // Credit balance + premium entitlement — fetched ONCE; drives the "Auto"
    // router (which model it may pick), the per-turn cap, and the premium gate.
    const creditConfigured = isCreditConfigured();
    const creditMicros =
      session?.user && session.user.type !== "guest" && creditConfigured
        ? await getCreditBalanceMicros(session.user.id)
        : 0;
    // Auto may route to premium when signed in AND (credit not configured →
    // premium is free for all, OR a positive balance). Mirrors the premium
    // credit gate below so the router never picks a model that would be blocked.
    const canUsePremium =
      Boolean(session?.user) && (!creditConfigured || creditMicros > 0);

    // "Auto" → classify the turn and pick the best entitled model (router). On a
    // tool-approval continuation (no fresh `message`), classify on the latest
    // user message so synthesis (e.g. a recipe) still routes to a capable model.
    type TextPart = { type?: string; text?: string };
    const partsText = (parts: TextPart[] | undefined): string =>
      (parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join(" ")
        .trim();
    const lastUserText = (
      msgs: Array<{ role?: string; parts?: TextPart[] }> | undefined
    ): string => {
      for (let i = (msgs?.length ?? 0) - 1; i >= 0; i--) {
        if (msgs?.[i]?.role === "user") {
          return partsText(msgs[i].parts);
        }
      }
      return "";
    };
    const routeText =
      partsText(message?.parts as TextPart[] | undefined) ||
      lastUserText(messages as Array<{ role?: string; parts?: TextPart[] }>);
    const routeDecision =
      selectedChatModel === AUTO_MODEL_ID
        ? await routeTurn({ userText: routeText, canUsePremium })
        : null;

    // Recipes are a USER-INITIATED paid action — the agent must NOT spontaneously
    // spend on one for a general question (the Recipes "Run" button seeds
    // "Run the <Name> recipe …"; a user can also ask explicitly). Only expose
    // `run_recipe` to the model on such turns. Deterministic + model-agnostic, so
    // no model can surprise the user with an unprompted paid recipe card; general
    // research questions answer via the free web_search path instead.
    const isExplicitRecipe = /\brun\b[\s\S]*\brecipe\b/i.test(routeText);

    // Anonymous "try-before-signup" is allowed: no session => free-model-only,
    // no server persistence. Premium models + saved history require sign-in.
    const requestedModel = routeDecision
      ? routeDecision.modelId
      : allowedModelIds.has(selectedChatModel)
        ? selectedChatModel
        : DEFAULT_CHAT_MODEL;
    // Confidential (TEE) models route directly to RedPill (the Gateway has no
    // `phala/*` model) AND are a PAID perk — only routable when the tier is
    // configured AND the user is on Pro/Max. Otherwise degrade to the default
    // (rather than 404 / give it away free).
    const requestedRoutable =
      !isConfidentialModel(requestedModel) ||
      (isConfidentialConfigured() && isPaidTier);
    const requestedIsFree =
      chatModels.find((m) => m.id === requestedModel)?.free === true;
    // `let` because research turns override it to the cheap research model below
    // (after the research gate, which needs the loaded history).
    let chatModel =
      (session?.user || requestedIsFree) && requestedRoutable
        ? requestedModel
        : DEFAULT_CHAT_MODEL;

    // IP rate-limit guards the ANONYMOUS try-before-signup surface only (no
    // account to cap). Authed users — free OR paid — are governed by the
    // per-user hourly cap below (100 free / 10k paid), so the strict 10/hr IP
    // guard must NOT apply to them (it was capping paying subscribers at 10/hr).
    if (!session?.user) {
      await checkIpRateLimit(ipAddress(request));
    }

    const isToolApprovalFlow = Boolean(messages);
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    // Per-user cap + persistence are authed-only; anonymous chats are
    // client-side/ephemeral (sign in to save them).
    if (session?.user) {
      const userType: UserType = session.user.type;
      // Cap is lifted for anyone who has PAID — an active sub OR a positive
      // credit balance (PAYG top-up); free authed keeps the acquisition cap.
      // (dbUser was already fetched above for the Confidential gate.)
      const cap = maxMessagesPerHour(userType, {
        subscriptionTier: dbUser?.subscriptionTier,
        hasCredit: creditMicros > 0,
      });
      const messageCount = await getMessageCountByUserId({
        id: session.user.id,
        differenceInHours: 1,
      });
      if (messageCount > cap) {
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

    // Intent gates read the last 2 user messages so the intent survives ONE
    // clarifying round-trip ("generate an image" → "of what?" → "a cat"). The
    // client sends only the new `message`; the prior user turn lives in
    // `messagesFromDb` (authed history) — so this MUST run after it loads. The
    // router still classifies only the latest message.
    const priorUserText = lastUserText(
      messagesFromDb as unknown as Array<{
        role?: string;
        parts?: TextPart[];
      }>
    );
    const recentUserText = `${routeText} ${priorUserText}`.trim();

    // Artifacts are now ONLY code / sheet / image (prose is always inline). This
    // gate opts createDocument in only on creation intent that maps to a panel
    // artifact. Prose verbs/nouns (essay/poem/haiku) are intentionally NOT here.
    // ("code" the noun is excluded — it matches "AI code …".)
    const isExplicitArtifact =
      /\b(write|draft|create|generate|build|make|design|implement|rewrite|draw|illustrate|spreadsheet)\b/i.test(
        recentUserText
      );

    // Visible main-loop research (replaces the old deep_research subagent): a
    // research-shaped turn injects the research directive + a higher step budget
    // so the model runs several VISIBLE web_search steps (rendered live in the
    // chain-of-thought timeline). Fires off-Auto too (explicit intent over the
    // last 2 user messages) so anon / explicit-model users get it, not just Auto.
    const isExplicitResearch =
      /\b(research|deep[- ]?dive|in[- ]depth)\b/i.test(recentUserText) ||
      /\banaly[sz]e\b[\s\S]*\b(market|landscape|industry|trend)/i.test(
        recentUserText
      ) ||
      /\bcompare\b[\s\S]*\b(with sources|across)/i.test(recentUserText);
    const researchActive =
      isExplicitResearch ||
      routeDecision?.classification?.intent === "research" ||
      routeDecision?.classification?.needsDeepResearch === true;

    // Research runs ~12 steps — on Auto, route the loop to a REASONING model
    // (Gemini 3 Pro) so its thinking streams as reasoning parts that interleave
    // with the searches in the chain-of-thought timeline (the "premium",
    // Claude-like research feel) — and it does better follow-up searches. Auto
    // only (explicit model picks are respected) + premium-entitled. Catches the
    // chip flow's follow-up turn too, where the router classified only the topic.
    if (routeDecision && researchActive && canUsePremium) {
      chatModel = "google/gemini-3-pro-preview";
    }

    // Keep artifacts active when this chat ALREADY has one — so refinement turns
    // WITHOUT a creation verb ("add a glow", "warmer colors", "make it sleeker")
    // can still edit it. Otherwise the verb-only gate would disable
    // createDocument mid-refinement and the agent couldn't change the artifact.
    const hasExistingArtifact = messagesFromDb.some(
      (m) =>
        m.role === "assistant" &&
        Array.isArray(m.parts) &&
        (m.parts as Array<{ type?: string }>).some(
          (p) =>
            p.type === "tool-createDocument" || p.type === "tool-updateDocument"
        )
    );
    const artifactsActive =
      isExplicitArtifact || isExplicitRecipe || hasExistingArtifact;

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

    // Resolve dangling client-executed tool calls (ask_user / send_transfer /
    // run_recipe) the user bypassed by typing a new message instead of using the
    // card. Left unresolved, `convertToModelMessages` throws "Tool result is
    // missing" and the whole turn fails. Synthesize a benign "skipped" result so
    // the conversation continues (the model treats the user's chat reply as the
    // answer). Applies to history only — the new user message has no tool calls.
    const CLIENT_TOOL_PART_TYPES = new Set([
      "tool-ask_user",
      "tool-send_transfer",
      "tool-run_recipe",
    ]);
    uiMessages = uiMessages.map((m) => ({
      ...m,
      parts: m.parts.map((p) => {
        const pt = p as { type?: string; state?: string };
        if (
          pt.type &&
          CLIENT_TOOL_PART_TYPES.has(pt.type) &&
          (pt.state === "input-available" || pt.state === "input-streaming")
        ) {
          return {
            ...p,
            state: "output-available",
            output: {
              skipped: true,
              note: "The user responded in chat instead of using this card — use their message.",
            },
          } as ChatMessage["parts"][number];
        }
        return p;
      }),
    }));

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

    const modelConfig = allChatModels.find((m) => m.id === chatModel);
    const isConfidential = isConfidentialModel(chatModel);

    // Credit gate (Phase 5): premium (non-free) models are metered against the
    // credit balance. When the credit rail is live and the user is out of
    // credit, block premium with a clear top-up prompt — the free model (Kimi)
    // always works. Inert when Stripe isn't configured (premium stays free).
    const isPremiumModel = modelConfig?.free !== true;
    if (
      session?.user &&
      isPremiumModel &&
      creditConfigured &&
      creditMicros <= 0
    ) {
      return new ChatbotError("bad_request:credit").toResponse();
    }

    const modelCapabilities = await getCapabilities();
    const capabilities = modelCapabilities[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;
    const supportsTools = capabilities?.tools === true;

    // Anthropic (+ other strict providers) require tool_use ids to match
    // ^[a-zA-Z0-9_-]+$ — a round-tripped id carrying illegal chars (./:/) is
    // rejected ("tool_use.id: String should match pattern"). Sanitize every
    // toolCallId deterministically: the call + its result share the id, so the
    // same transform keeps them paired. No-op for already-valid ids.
    const sanitizedMessages = uiMessages.map((m) => ({
      ...m,
      parts: m.parts.map((p) => {
        const tid = (p as { toolCallId?: string }).toolCallId;
        return typeof tid === "string" && /[^a-zA-Z0-9_-]/.test(tid)
          ? ({
              ...p,
              toolCallId: tid.replace(/[^a-zA-Z0-9_-]/g, "_"),
            } as typeof p)
          : p;
      }),
    }));

    // Inline private-blob image attachments as base64 so vision models receive
    // the pixels (they can't fetch our session-gated /api/files/blob URLs).
    const inlinedMessages = await inlineImageAttachments(sanitizedMessages);
    // Gemini 3 requires a thoughtSignature on replayed assistant tool-call /
    // reasoning parts (missing → 400 on tool turns, warning otherwise). Keep the
    // real signature when present; inject Google's sentinel where it's absent
    // (lossy persistence / failover). No-op for every other model.
    const modelMessages = isGemini3(chatModel)
      ? ensureGeminiThoughtSignatures(
          await convertToModelMessages(inlinedMessages)
        )
      : await convertToModelMessages(inlinedMessages);

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const baseModel = getLanguageModel(chatModel);
        // Recall this user's memories and inject them into the LEADING system
        // prompt (model-agnostic). The withMemWal wrapper used to splice recall
        // as a mid-conversation system message, which Vertex/Gemini rejects
        // ("system messages are only supported at the beginning") → 400.
        const recallQuery =
          message?.parts
            ?.filter((p) => p.type === "text")
            .map((p) => p.text)
            .join(" ")
            .trim() ?? "";
        const memoryRecall =
          memoryOn && session?.user && recallQuery
            ? await recallMemoryBlock(session.user.id, recallQuery)
            : null;
        const baseActiveTools: ActiveTool[] =
          isReasoningModel && !supportsTools
            ? []
            : session?.user
              ? [
                  "web_search",
                  "ask_user",
                  "balance_check",
                  "transaction_history",
                  "resolve_suins",
                  "send_transfer",
                  ...(artifactsActive
                    ? ([
                        "createDocument",
                        "editDocument",
                        "updateDocument",
                        "requestSuggestions",
                      ] as ActiveTool[])
                    : []),
                  ...(isExplicitRecipe ? (["run_recipe"] as ActiveTool[]) : []),
                  ...(memoryOn ? (["save_memory"] as ActiveTool[]) : []),
                ]
              : isExplicitArtifact
                ? ["web_search", "ask_user", "createDocument"]
                : ["web_search", "ask_user"];

        const result = streamText({
          model: baseModel,
          system: systemPrompt({
            requestHints,
            supportsTools,
            isAuthed: Boolean(session?.user),
            memoryOn,
            memoryRecall,
            walletAddress: session?.user?.id,
            artifactsActive,
            recipesActive: isExplicitRecipe,
            researchActive,
          }),
          messages: modelMessages,
          // Step budget: research turns get a high budget for several visible
          // web_search steps (works off-Auto too); otherwise the router's
          // difficulty-scaled budget, default 5.
          stopWhen: stepCountIs(
            researchActive ? 12 : (routeDecision?.stepBudget ?? 5)
          ),
          experimental_activeTools: baseActiveTools,
          // Once a doc-mutation tool has run this turn, remove them all from the
          // active set so NO model can chain a second artifact write (the
          // duplicate-artifact class). Structural — independent of prompt wording
          // or per-model tool-loop quirks; the model can still narrate.
          prepareStep: ({ steps }) => {
            const usedDocTool = steps.some((s) =>
              s.toolCalls?.some((tc) =>
                DOC_MUTATION_TOOLS.has(tc?.toolName as ActiveTool)
              )
            );
            if (!usedDocTool) {
              return {};
            }
            return {
              activeTools: baseActiveTools.filter(
                (t) => !DOC_MUTATION_TOOLS.has(t)
              ),
            };
          },
          providerOptions: {
            // Confidential models bypass the Gateway entirely (direct to the
            // RedPill TEE), so Gateway options don't apply — the TEE itself is
            // the privacy guarantee (stronger than ZDR). For every Gateway
            // model: Zero Data Retention routes ONLY to providers contractually
            // bound not to store or train on prompts (the "Private · ZDR" rung;
            // a model with no ZDR provider fails no_providers_available).
            ...(isConfidential
              ? {}
              : {
                  gateway: {
                    zeroDataRetention: true,
                    ...(modelConfig?.gatewayOrder && {
                      order: modelConfig.gatewayOrder,
                    }),
                  },
                }),
            ...((routeDecision?.reasoningEffort ??
              modelConfig?.reasoningEffort) && {
              openai: {
                reasoningEffort:
                  routeDecision?.reasoningEffort ??
                  modelConfig?.reasoningEffort,
              },
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
            // Client-executed clarifying-question form (no server execute).
            ask_user: askUser,
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
                  createdAt: turnStartedAt,
                  modelId: chatModel,
                  autoRouted: selectedChatModel === AUTO_MODEL_ID,
                };
              }
              if (part.type === "finish") {
                const u = part.totalUsage;
                return {
                  createdAt: turnStartedAt,
                  modelId: chatModel,
                  autoRouted: selectedChatModel === AUTO_MODEL_ID,
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

        // Confidential (TEE) turn → surface the response id so the client can
        // fetch its TEE-signed receipt (the "verifiable per request" proof).
        // Best-effort + post-merge so it never blocks or breaks the stream.
        if (isConfidential) {
          try {
            const resp = await result.response;
            if (resp?.id) {
              dataStream.write({
                type: "data-tee-receipt",
                data: { responseId: resp.id, model: chatModel },
              });
            }
          } catch (_) {
            /* non-fatal — no receipt badge this turn */
          }
        }

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
          const pricing = isConfidential
            ? (await getConfidentialCatalog()).pricing[chatModel]
            : (await getModelPricing())[chatModel];
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
