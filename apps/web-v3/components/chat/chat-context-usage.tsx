"use client";

import useSWR from "swr";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { chatModels, type ModelPricing } from "@/lib/ai/models";
import type { ChatMessage, MessageMetadata } from "@/lib/types";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function fmtTokens(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(n);
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2,
  }).format(n);
}

function latestUsageMeta(messages: ChatMessage[]): MessageMetadata | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.metadata?.totalTokens) {
      return m.metadata;
    }
  }
  return;
}

function UsageRow({
  label,
  tokens,
  cost,
}: {
  label: string;
  tokens: number;
  cost?: number;
}) {
  if (tokens <= 0) {
    return null;
  }
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {fmtTokens(tokens)}
        {cost !== undefined && cost > 0 && (
          <span className="ml-2 text-muted-foreground">{fmtUsd(cost)}</span>
        )}
      </span>
    </div>
  );
}

// Ambient context-window usage card (SPEC_AUDRIC_V3 §5c — transparent metered
// usage, ambient not foregrounded). Shows the just-finished turn's context %
// + token breakdown on hover. Cost is the underlying Gateway cost; the free
// model shows "Free" (matches the switcher's labeling). Pairs with the Phase 5
// credit rail. Renders nothing until a turn produces usage metadata.
export function ChatContextUsage({
  messages,
  selectedModelId,
}: {
  messages: ChatMessage[];
  selectedModelId: string;
}) {
  // Distinct cache entry (`?ctx`) so the card always resolves the current
  // response shape. The shared `/api/models` entry can be stale for up to its
  // browser TTL after an additive field (e.g. `contextWindow`) is added; a
  // separate URL sidesteps that and self-heals without a hard refresh.
  const { data } = useSWR(
    `${BASE_PATH}/api/models?ctx`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );
  const pricing: Record<string, ModelPricing> | undefined = data?.pricing;

  const meta = latestUsageMeta(messages);
  const totalTokens = meta?.totalTokens;
  if (!(meta && totalTokens)) {
    return null;
  }

  const modelId = meta.modelId ?? selectedModelId;
  const p = pricing?.[modelId];
  const maxTokens = p?.contextWindow;
  if (!maxTokens) {
    return null;
  }

  const isFree = chatModels.find((m) => m.id === modelId)?.free === true;
  const inputTokens = meta.inputTokens ?? 0;
  const outputTokens = meta.outputTokens ?? 0;
  const reasoningTokens = meta.reasoningTokens ?? 0;

  const inputCost = isFree
    ? 0
    : (inputTokens / 1_000_000) * (p.inputPer1M ?? 0);
  const outputCost = isFree
    ? 0
    : (outputTokens / 1_000_000) * (p.outputPer1M ?? 0);
  const totalCost = inputCost + outputCost;

  return (
    <Context maxTokens={maxTokens} usedTokens={totalTokens}>
      <ContextTrigger className="h-7 gap-1.5 rounded-lg px-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground" />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <div className="space-y-1.5">
            <UsageRow
              cost={isFree ? undefined : inputCost}
              label="Input"
              tokens={inputTokens}
            />
            <UsageRow
              cost={isFree ? undefined : outputCost}
              label="Output"
              tokens={outputTokens}
            />
            <UsageRow label="Reasoning" tokens={reasoningTokens} />
          </div>
        </ContextContentBody>
        <ContextContentFooter>
          <span className="text-muted-foreground">This turn</span>
          <span className="font-medium tabular-nums">
            {isFree || totalCost <= 0 ? "Free" : fmtUsd(totalCost)}
          </span>
        </ContextContentFooter>
      </ContextContent>
    </Context>
  );
}
