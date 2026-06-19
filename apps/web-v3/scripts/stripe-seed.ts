/**
 * Stripe seed (Phase 5 subscriptions scaffold). Idempotently creates the
 * recurring monthly Product + Price for each paid tier and prints the
 * `STRIPE_PRICE_*` env lines to paste into `.env.local` (and Vercel).
 *
 * Idempotency: each tier's Price carries a stable `lookup_key`
 * (`audric_<tier>_monthly`) — a re-run reuses the existing Price instead of
 * creating duplicates. Prices are immutable in Stripe, so changing a tier's
 * price means a new lookup_key/Price (handled by bumping the version below).
 *
 * Run from apps/web-v3:  pnpm stripe:seed   (loads STRIPE_SECRET_KEY from .env.local)
 *
 * ⚠️ Prices are PLACEHOLDERS — TODO(usage-data). This wires the mechanism; the
 * real numbers land once per-token costs are measured.
 */

import dotenv from "dotenv";
import Stripe from "stripe";
import { TIERS } from "../lib/credit/tiers";

dotenv.config({ path: ".env.local" });

const PRICE_VERSION = "v1";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("✗ STRIPE_SECRET_KEY not set (.env.local). Aborting.");
    process.exit(1);
  }
  const stripe = new Stripe(key, { appInfo: { name: "audric-v3-seed" } });

  const paidTiers = TIERS.filter((t) => t.priceEnv && t.priceUsd);
  const results: Array<{ envKey: string; priceId: string }> = [];

  for (const tier of paidTiers) {
    const lookupKey = `audric_${tier.id}_monthly_${PRICE_VERSION}`;

    const existing = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 1,
    });

    let price = existing.data[0];
    if (price) {
      console.log(`✓ ${tier.name}: reusing existing price ${price.id}`);
    } else {
      const found = await stripe.products.search({
        query: `metadata['audric_tier']:'${tier.id}'`,
        limit: 1,
      });
      const product =
        found.data[0] ??
        (await stripe.products.create({
          name: `Audric ${tier.name}`,
          description: tier.tagline,
          metadata: { audric_tier: tier.id },
        }));

      price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        // biome-ignore lint/style/noNonNullAssertion: filtered to priceUsd above
        unit_amount: tier.priceUsd! * 100,
        recurring: { interval: "month" },
        lookup_key: lookupKey,
        metadata: { audric_tier: tier.id },
      });
      console.log(
        `+ ${tier.name}: created price ${price.id} ($${tier.priceUsd}/mo)`
      );
    }

    // biome-ignore lint/style/noNonNullAssertion: paidTiers are filtered on priceEnv
    results.push({ envKey: tier.priceEnv!, priceId: price.id });
  }

  console.log("\n── Add these to .env.local (and Vercel env) ──");
  for (const r of results) {
    console.log(`${r.envKey}=${r.priceId}`);
  }
  console.log("\nDone. Restart the dev server to pick up the new env.");
}

main().catch((e) => {
  console.error("✗ seed failed:", e);
  process.exit(1);
});
