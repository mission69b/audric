import { tool } from "ai";
import { z } from "zod";

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
 * The recipe id + inputs come from the catalog (lib/recipes/catalog.ts) — the
 * agent passes the matching id (e.g. "morning_brief", "ticker_deep_dive") and
 * any inputs (e.g. the ticker symbol). The user ALWAYS confirms the bundled
 * price before any spend.
 */
export const runRecipeTool = tool({
  description:
    "Run a curated Recipe — a multi-service live-data flow paid in USDC from the user's Passport. " +
    'Pass the recipe `recipeId` (morning_brief or ticker_deep_dive) and any `inputs` (e.g. {"symbol":"AAPL"} for ticker_deep_dive; {"city":"London"} optional for morning_brief). ' +
    "The user taps to confirm the bundled price — you never move money on your own. " +
    "When it returns, follow the `instruction` field in the result: synthesize the `data` into a document with createDocument. " +
    "If it returns partial:true, some steps failed — synthesize what's there and note what's missing. Never blind-retry (failed steps auto-refund).",
  inputSchema: z.object({
    recipeId: z
      .enum(["morning_brief", "ticker_deep_dive"])
      .describe("Which curated recipe to run."),
    inputs: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Recipe inputs as string pairs, e.g. {"symbol":"AAPL"} or {"city":"London"}. Omit if none.'
      ),
  }),
  // NO execute — client-executed via the zkLogin session key (see file header).
});
