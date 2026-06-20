import { tool } from "ai";
import { z } from "zod";
import { RECIPES } from "@/lib/recipes/catalog";

/**
 * run_recipe — run a curated multi-service Recipe paid in USDC from the user's
 * Passport (SPEC_AUDRIC_V3 §9 Phase 4b).
 *
 * CLIENT-EXECUTED: no server `execute` (the zkLogin key lives in the browser).
 * On the user's tap-to-confirm the CLIENT runs the recipe's paid step sequence
 * via `runRecipe` (lib/recipes/run.ts → payService) and returns the collected
 * data + a synthesis instruction via `addToolResult`. The agent then turns that
 * into a document with createDocument. See `components/chat/recipe-run-tool.tsx`.
 *
 * The recipeId enum + the input hint are DERIVED from the catalog
 * (lib/recipes/catalog.ts) — single source of truth, so adding a recipe never
 * silently leaves this tool constrained to a stale subset (which once made the
 * model run the wrong recipe). The user ALWAYS confirms the bundled price.
 */
const RECIPE_IDS = RECIPES.map((r) => r.id) as [string, ...string[]];
const RECIPE_HINT = RECIPES.map((r) => {
  const required = r.inputs.filter((i) => i.required).map((i) => i.name);
  const optional = r.inputs.filter((i) => !i.required).map((i) => i.name);
  const io = [
    required.length ? `required: ${required.join(", ")}` : "",
    optional.length ? `optional: ${optional.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return `${r.id} — ${r.name}${io ? ` (${io})` : " (no inputs)"}`;
}).join(" · ");

export const runRecipeTool = tool({
  description:
    "Run a curated Recipe — a multi-service live-data flow paid in USDC from the user's Passport. " +
    `Pass the matching \`recipeId\` and any \`inputs\` as string pairs. Recipes: ${RECIPE_HINT}. ` +
    "Pick the recipeId that matches what the user asked for — never substitute a different recipe. " +
    "The user taps to confirm the bundled price — you never move money on your own. " +
    "When it returns, follow the `instruction` field in the result: synthesize the `data` into a document with createDocument. " +
    "If it returns partial:true, some steps failed — synthesize what's there and note what's missing. Never blind-retry (failed steps auto-refund).",
  inputSchema: z.object({
    recipeId: z.enum(RECIPE_IDS).describe("Which curated recipe to run."),
    inputs: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Recipe inputs as string pairs, e.g. {"symbol":"AAPL"}, {"topic":"AI code assistants"}, {"company":"Stripe"}, {"city":"London"}. Omit if none.'
      ),
  }),
  // NO execute — client-executed via the zkLogin session key (see file header).
});
