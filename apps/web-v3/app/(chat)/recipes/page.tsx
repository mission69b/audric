"use client";

/**
 * Recipes — Explore surface (SPEC_AUDRIC_V3 §9 Phase 4b). Lists the curated
 * recipe cards; "Run" launches the recipe by navigating to a chat with a
 * pre-seeded query (use-active-chat auto-sends it), which the agent maps to the
 * run_recipe tool → bundled-price confirm → paid step sequence → artifact.
 */

import { SparklesIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RECIPES, type Recipe, recipePriceUsd } from "@/lib/recipes/catalog";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function launchText(recipe: Recipe, inputs: Record<string, string>): string {
  const parts = recipe.inputs
    .map((d) =>
      inputs[d.name]?.trim() ? `${d.name}: ${inputs[d.name].trim()}` : null
    )
    .filter(Boolean);
  const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `Run the ${recipe.name} recipe${suffix}`;
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const missingRequired = recipe.inputs.some(
    (d) => d.required && !inputs[d.name]?.trim()
  );

  const run = () => {
    const q = encodeURIComponent(launchText(recipe, inputs));
    router.push(`${BASE_PATH}/?query=${q}`);
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border/50 bg-card/40 p-5 transition-shadow hover:shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-foreground">{recipe.name}</h3>
        <span className="ml-auto rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          ${recipePriceUsd(recipe).toFixed(2)} USDC
        </span>
      </div>
      <p className="mt-1 text-muted-foreground text-sm">{recipe.tagline}</p>
      <p className="mt-2 text-muted-foreground/80 text-xs leading-relaxed">
        {recipe.description}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {recipe.steps.map((s) => (
          <span
            className="rounded-md bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
            key={s.key}
          >
            {s.service}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-4">
        {recipe.inputs.length > 0 && (
          <div className="mb-2 space-y-2">
            {recipe.inputs.map((d) => (
              <Input
                className="h-9 text-sm"
                key={d.name}
                onChange={(e) =>
                  setInputs((prev) => ({ ...prev, [d.name]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !missingRequired) {
                    run();
                  }
                }}
                placeholder={`${d.label}${d.required ? "" : " (optional)"} — e.g. ${d.placeholder}`}
                value={inputs[d.name] ?? ""}
              />
            ))}
          </div>
        )}
        <Button
          className="w-full"
          disabled={missingRequired}
          onClick={run}
          type="button"
        >
          Run · ${recipePriceUsd(recipe).toFixed(2)}
        </Button>
      </div>
    </div>
  );
}

export default function RecipesPage() {
  const router = useRouter();
  // The chat is a persistent shell in the (chat) layout, so this route renders
  // as an overlay over the content area (the sidebar stays usable).
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="mb-1 flex items-center gap-2">
          <SparklesIcon className="size-5 text-foreground" />
          <h1 className="font-semibold text-foreground text-xl">Recipes</h1>
          <button
            aria-label="Back to chat"
            className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => router.push(`${BASE_PATH}/`)}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <p className="mb-6 text-muted-foreground text-sm">
          Curated multi-service flows over live data — paid per run in USDC from
          your Passport. You confirm the bundled price before anything is
          charged.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {RECIPES.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      </div>
    </div>
  );
}
