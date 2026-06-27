/**
 * Read-only single-user inspector by EMAIL — full credit ledger + running
 * balance + auto-recharge config. NO writes.
 *   pnpm tsx scripts/inspect-user.ts <email>
 */

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

const usd = (m: number | bigint) =>
  `$${(Number(m) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 4 })}`;

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: pnpm tsx scripts/inspect-user.ts <email>");
    process.exit(1);
  }
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("✗ POSTGRES_URL not set.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  const [u] = await sql`
    select id, email, username, "subscriptionTier", "subscriptionStatus",
           "stripeCustomerId", "stripeSubscriptionId", "defaultPaymentMethodId",
           "autoRechargeEnabled", "autoRechargeThresholdUsd", "autoRechargeAmountUsd",
           "createdAt", "updatedAt"
    from "User" where email = ${email} limit 1`;

  if (!u) {
    console.log(`No user with email ${email}`);
    await sql.end();
    return;
  }

  console.log("\n── user ──");
  console.log({
    id: u.id,
    username: u.username,
    tier: u.subscriptionTier,
    status: u.subscriptionStatus,
    stripeCustomerId: u.stripeCustomerId,
    stripeSubscriptionId: u.stripeSubscriptionId,
    autoRecharge: u.autoRechargeEnabled,
    autoRechargeThresholdUsd: u.autoRechargeThresholdUsd,
    autoRechargeAmountUsd: u.autoRechargeAmountUsd,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  });

  const byType = await sql`
    select type, count(*)::int as rows, coalesce(sum("amountMicros"),0) as sum_micros
    from "CreditLedger" where "userId" = ${u.id} group by type order by 3 desc`;

  console.log("\n── ledger by type ──");
  let balance = 0;
  for (const r of byType) {
    balance += Number(r.sum_micros);
    console.log(
      `  ${String(r.type).padEnd(10)} rows:${String(r.rows).padStart(4)}  sum:${usd(r.sum_micros)}`
    );
  }
  console.log(`  ── BALANCE: ${usd(balance)}`);

  const rows = await sql`
    select "amountMicros", type, description, ref, "createdAt"
    from "CreditLedger" where "userId" = ${u.id} order by "createdAt" asc`;

  console.log(
    `\n── full ledger (${rows.length} rows, chronological, with running balance) ──`
  );
  let run = 0;
  for (const r of rows) {
    run += Number(r.amountMicros);
    const when = new Date(r.createdAt)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    const amt = `${Number(r.amountMicros) >= 0 ? "+" : ""}${usd(r.amountMicros)}`;
    console.log(
      `  ${when}  ${amt.padStart(12)}  →${usd(run).padStart(12)}  ${String(r.type).padEnd(9)} ${r.description ?? ""} ${r.ref ? `[ref:${r.ref}]` : ""}`
    );
  }
  console.log("");

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
