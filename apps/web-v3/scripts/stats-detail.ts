/**
 * Read-only follow-up stats — sign-in recency, DAU/WAU, ledger breakdown.
 * NO writes. updatedAt bumps on every sign-in (queries.ts upsert) → used as a
 * "last signed-in" proxy (also bumps on profile/credit mutations — caveat).
 *   pnpm tsx scripts/stats-detail.ts
 */

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

const usd = (m: number | bigint) =>
  `$${(Number(m) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("✗ POSTGRES_URL not set.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  const [seen] = await sql`
    select
      count(*) filter (where "updatedAt" > now() - interval '24 hours')::int as d1,
      count(*) filter (where "updatedAt" > now() - interval '7 days')::int   as d7,
      count(*) filter (where "updatedAt" > now() - interval '30 days')::int  as d30,
      count(*) filter (where "createdAt" > now() - interval '7 days')::int   as new7
    from "User"`;

  const [active] = await sql`
    select
      (select count(distinct c."userId") from "Message_v2" m
         join "Chat" c on c.id = m."chatId"
         where m."createdAt" > now() - interval '24 hours')::int as dau,
      (select count(distinct c."userId") from "Message_v2" m
         join "Chat" c on c.id = m."chatId"
         where m."createdAt" > now() - interval '7 days')::int  as wau,
      (select count(distinct c."userId") from "Message_v2" m
         join "Chat" c on c.id = m."chatId"
         where m."createdAt" > now() - interval '30 days')::int as mau`;

  const signinDaily = await sql`
    select to_char(date_trunc('day', "updatedAt"), 'MM-DD') as day, count(*)::int as seen
    from "User" where "updatedAt" > now() - interval '8 days'
    group by 1 order by 1`;

  const newDaily = await sql`
    select to_char(date_trunc('day', "createdAt"), 'MM-DD') as day, count(*)::int as n
    from "User" where "createdAt" > now() - interval '8 days'
    group by 1 order by 1`;

  const ledger = await sql`
    select type, count(*)::int as rows, count(distinct "userId")::int as users,
           coalesce(sum("amountMicros"), 0) as sum_micros
    from "CreditLedger" group by type order by rows desc`;

  const topups = await sql`
    select right("userId", 6) as u, "amountMicros", to_char("createdAt",'YYYY-MM-DD') as day, type, description
    from "CreditLedger" where type in ('topup','recharge') order by "createdAt"`;

  const grantsByAmt = await sql`
    select "amountMicros", count(*)::int as rows, count(distinct "userId")::int as users
    from "CreditLedger" where type = 'grant' group by 1 order by rows desc`;

  const grantDesc = await sql`
    select coalesce(description,'—') as description, count(*)::int as rows
    from "CreditLedger" where type = 'grant' group by 1 order by 2 desc limit 8`;

  const subs = await sql`
    select right(u.id,6) as u, u."subscriptionTier" as tier,
      (select coalesce(sum(cl."amountMicros"),0) from "CreditLedger" cl
         where cl."userId" = u.id and cl.type in ('topup','recharge')) as topped_micros
    from "User" u where u."subscriptionTier" <> 'free' order by 2`;

  console.log("\n── Sign-in recency (updatedAt proxy) ──");
  console.log(
    `  Signed in / touched — 24h: ${seen.d1}   7d: ${seen.d7}   30d: ${seen.d30}`
  );
  console.log(`  (vs NEW accounts in 7d: ${seen.new7})`);

  console.log("\n── Active users by message activity (join) ──");
  console.log(
    `  DAU (24h): ${active.dau}   WAU (7d): ${active.wau}   MAU (30d): ${active.mau}`
  );

  console.log("\n── Per-day, last 8 days ──");
  console.log("  signed-in (updatedAt):");
  for (const r of signinDaily) {
    console.log(`    ${r.day}: ${r.seen}`);
  }
  console.log("  new accounts (createdAt):");
  for (const r of newDaily) {
    console.log(`    ${r.day}: ${r.n}`);
  }

  console.log("\n── Credit ledger by type ──");
  for (const r of ledger) {
    console.log(
      `  ${String(r.type).padEnd(10)} rows:${String(r.rows).padStart(4)}  users:${String(r.users).padStart(4)}  sum:${usd(r.sum_micros)}`
    );
  }

  console.log("\n── Top-ups / recharges (the real money in) ──");
  if (topups.length === 0) {
    console.log("  (none)");
  }
  for (const r of topups) {
    console.log(
      `  …${r.u}  ${usd(r.amountMicros)}  ${r.day}  ${r.type}  ${r.description ?? ""}`
    );
  }

  console.log("\n── Grants ($ free credit) — by amount ──");
  for (const r of grantsByAmt) {
    console.log(`  ${usd(r.amountMicros)} × ${r.rows} rows (${r.users} users)`);
  }
  console.log("  grant descriptions:");
  for (const r of grantDesc) {
    console.log(`    "${r.description}" × ${r.rows}`);
  }

  console.log("\n── Subscribers (tier + have they topped up?) ──");
  for (const r of subs) {
    console.log(`  …${r.u}  ${r.tier}  topped: ${usd(r.topped_micros)}`);
  }
  console.log("");

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
