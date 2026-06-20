"use client";

/**
 * Client half of the run_recipe money-flow (Audric v3, Phase 4b). The server
 * emits a `run_recipe` tool part (no server execute); this renders the bundled-
 * price confirm card and, on Allow, runs the recipe's paid step sequence
 * IN-BROWSER via `runRecipe` (zkLogin session key signs each x402 call,
 * frictionless), streaming per-step progress, then returns the collected data +
 * synthesis instruction to the agent with `addToolResult`. The agent turns it
 * into a document. The user always confirms the price first — Passport "you decide".
 */

import { CheckIcon, DotIcon, Loader2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { useActiveChat } from "@/hooks/use-active-chat";
import { getRecipe, recipePriceUsd } from "@/lib/recipes/catalog";
import { runRecipe, type StepStatus } from "@/lib/recipes/run";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type RecipePart = Extract<
  ChatMessage["parts"][number],
  { type: "tool-run_recipe" }
>;

function fmtUsd(n: number): string {
  return `$${(Math.round(n * 1_000_000) / 1_000_000).toFixed(2)}`;
}

async function fetchUsdc(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE_PATH}/api/wallet/balance`);
    if (!res.ok) {
      return null;
    }
    const j = (await res.json()) as { usdc: number | null };
    return j.usdc;
  } catch {
    return null;
  }
}

export function RecipeRunTool({ part }: { part: RecipePart }) {
  const { addToolResult } = useActiveChat();
  const [pending, setPending] = useState(false);
  const [stepStatus, setStepStatus] = useState<Record<string, StepStatus>>({});
  const { toolCallId, state } = part;
  const widthClass = "w-[min(100%,460px)]";

  async function settle(output: unknown) {
    await addToolResult({
      tool: "run_recipe",
      toolCallId,
      output: output as never,
    });
  }

  if (state === "output-available") {
    const out = part.output as {
      recipeName?: string;
      paidUsd?: number;
      partial?: boolean;
      denied?: boolean;
      error?: string;
      steps?: { label: string; ok: boolean }[];
    };
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full">
          <ToolHeader state="output-available" type="tool-run_recipe" />
          <ToolContent>
            <div className="px-4 py-3 text-sm">
              {out?.error && <span className="text-red-600">{out.error}</span>}
              {out?.denied && (
                <span className="text-muted-foreground">Recipe declined.</span>
              )}
              {out?.steps && !(out.error || out.denied) && (
                <div className="space-y-1.5">
                  <div className="font-medium">
                    {out.recipeName} · paid {fmtUsd(out.paidUsd ?? 0)}
                    {out.partial && (
                      <span className="ml-2 text-amber-600 text-xs">
                        (partial)
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-3">
                    {out.steps.map((s) => (
                      <ChainOfThoughtStep
                        className={cn(!s.ok && "text-red-600")}
                        icon={s.ok ? CheckIcon : XIcon}
                        key={s.label}
                        label={s.label}
                        status="complete"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ToolContent>
        </Tool>
      </div>
    );
  }

  const input = part.input;
  const recipe = input?.recipeId ? getRecipe(input.recipeId) : undefined;

  if (!recipe) {
    return (
      <div className={widthClass} key={toolCallId}>
        <Tool className="w-full" defaultOpen={true}>
          <ToolHeader state={state} type="tool-run_recipe" />
        </Tool>
      </div>
    );
  }

  const rawInputs = (input?.inputs ?? {}) as Record<string, string>;
  const price = recipePriceUsd(recipe);

  const onAllow = async () => {
    setPending(true);
    try {
      const usdc = await fetchUsdc();
      if (usdc != null && usdc < price) {
        await settle({
          recipeName: recipe.name,
          error: `This recipe costs ${fmtUsd(price)} but your Passport holds ${fmtUsd(usdc)}. Add USDC and try again — nothing was charged.`,
        });
        return;
      }
      const result = await runRecipe(recipe, rawInputs, (key, status) =>
        setStepStatus((prev) => ({ ...prev, [key]: status }))
      );
      await settle(result);
    } catch (e) {
      await settle({
        recipeName: recipe.name,
        error: `${(e as Error).name}: ${(e as Error).message}`,
      });
    } finally {
      setPending(false);
    }
  };

  const inputSummary = recipe.inputs
    .map((d) => rawInputs[d.name])
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={widthClass} key={toolCallId}>
      <Tool className="w-full" defaultOpen={true}>
        <ToolHeader state={state} type="tool-run_recipe" />
        <ToolContent>
          <div className="px-4 pt-3 text-sm">
            <div className="font-medium">
              {recipe.name}
              {inputSummary && (
                <span className="ml-1 text-muted-foreground">
                  · {inputSummary}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-muted-foreground text-xs">
              {recipe.tagline}
            </div>
            <div className="mt-3 space-y-3">
              {recipe.steps.map((s) => {
                const st = stepStatus[s.key];
                const status =
                  st === "done"
                    ? "complete"
                    : st === "running"
                      ? "active"
                      : "pending";
                const icon =
                  st === "done"
                    ? CheckIcon
                    : st === "error"
                      ? XIcon
                      : st === "running"
                        ? Loader2Icon
                        : DotIcon;
                return (
                  <ChainOfThoughtStep
                    className={cn(
                      st === "error" && "text-red-600",
                      st === "running" && "[&_svg]:animate-spin"
                    )}
                    description={
                      st ? s.service : `${s.service} · ${fmtUsd(s.priceUsd)}`
                    }
                    icon={icon}
                    key={s.key}
                    label={s.label}
                    status={status}
                  />
                );
              })}
            </div>
            <div className="mt-2 border-t pt-2 font-medium text-foreground">
              Total · {fmtUsd(price)} USDC · gasless
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 border-t px-4 py-3">
            <button
              className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              disabled={pending}
              onClick={() => settle({ recipeName: recipe.name, denied: true })}
              type="button"
            >
              Deny
            </button>
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              disabled={pending}
              onClick={onAllow}
              type="button"
            >
              {pending ? "Running…" : `Allow & Pay ${fmtUsd(price)}`}
            </button>
          </div>
        </ToolContent>
      </Tool>
    </div>
  );
}
