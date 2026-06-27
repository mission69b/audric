/**
 * Read-only Audric v3 stats snapshot — signups, paid users, credit/spend.
 * NO writes. Aggregates only (no PII printed).
 *   pnpm tsx scripts/stats.ts                      # .env.local POSTGRES_URL
 *   POSTGRES_URL=<prod-url> pnpm tsx scripts/stats.ts
 *
 * NOTE: web traffic + billing-page views live in Vercel Web Analytics, and raw
 * token counts live in the Vercel AI Gateway dashboard — neither is in this DB.
 * The "spend" figures below are the USD debited per turn (the DB's token proxy).
 */

import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

const usd = (micros: number | bigint) =>
  `$${(Number(micros) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("✗ POSTGRES_URL not set (add it to .env.local).");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  const [users] = await sql`
    select
      count(*)::int                                                              as total,
      count(*) filter (where "isAnonymous" = false)::int                         as registered,
      count(*) filter (where "isAnonymous" = true)::int                          as anonymous,
      count(*) filter (where email is not null)::int                             as with_email,
      count(*) filter (where username is not null)::int                          as with_handle,
      count(*) filter (where "createdAt" > now() - interval '24 hours')::int     as new_24h,
      count(*) filter (where "createdAt" > now() - interval '7 days')::int       as new_7d,
      count(*) filter (where "createdAt" > now() - interval '30 days')::int      as new_30d
    from "User"`;

  const [paid] = await sql`
    select
      count(*) filter (where "subscriptionTier" <> 'free')::int                  as paid_tier_any,
      count(*) filter (where "subscriptionStatus" = 'active')::int               as sub_active,
      count(*) filter (where "stripeCustomerId" is not null)::int                as stripe_customers
    from "User"`;

  const subsByTier = await sql`
    select "subscriptionTier" as tier,
           coalesce("subscriptionStatus", '—') as status,
           count(*)::int as n
    from "User"
    where "subscriptionTier" <> 'free'
    group by 1, 2
    order by 3 desc`;

  const [money] = await sql`
    select
      count(distinct "userId") filter (where type in ('topup','recharge'))::int  as paying_users,
      coalesce(sum("amountMicros") filter (where type in ('topup','recharge')), 0) as money_in_micros,
      coalesce(sum("amountMicros") filter (where type = 'grant'), 0)              as granted_micros,
      coalesce(sum("amountMicros") filter (where type = 'referral'), 0)           as referral_micros,
      coalesce(sum("amountMicros"), 0)                                           as outstanding_micros
    from "CreditLedger"`;

  const [debits] = await sql`
    select
      count(*)::int                                                              as turns_total,
      coalesce(sum(-"amountMicros"), 0)                                          as spent_micros,
      count(*) filter (where "createdAt" > now() - interval '7 days')::int       as turns_7d,
      count(*) filter (where "createdAt" > now() - interval '30 days')::int      as turns_30d
    from "CreditLedger" where type = 'debit'`;

  const [chats] = await sql`select count(*)::int as n from "Chat"`;
  const [msgs] = await sql`
    select count(*)::int as total,
           count(*) filter (where role = 'user')::int as user_msgs
    from "Message_v2"`;
  const [active] = await sql`
    select count(distinct "userId")::int as n
    from "Chat" where "createdAt" > now() - interval '7 days'`;
  const [refs] = await sql`
    select count(*)::int as total,
           count(*) filter (where status = 'rewarded')::int as rewarded
    from "Referral"`;

  console.log("\n══════════ AUDRIC v3 — STATS SNAPSHOT ══════════");
  console.log(`(${new Date().toISOString()})\n`);

  console.log("── Signups ──");
  console.log(`  Total users:        ${users.total}`);
  console.log(`  Registered (real):  ${users.registered}`);
  console.log(`  Anonymous:          ${users.anonymous}`);
  console.log(`  With email:         ${users.with_email}`);
  console.log(`  With @handle:       ${users.with_handle}`);
  console.log(
    `  New (24h/7d/30d):   ${users.new_24h} / ${users.new_7d} / ${users.new_30d}\n`
  );

  console.log("── Paid / subscriptions ──");
  console.log(`  Paying users (ever topped up): ${money.paying_users}`);
  console.log(`  Active subscriptions:          ${paid.sub_active}`);
  console.log(`  Any non-free tier:             ${paid.paid_tier_any}`);
  console.log(`  Stripe customers:              ${paid.stripe_customers}`);
  if (subsByTier.length) {
    console.log("  Subscription breakdown:");
    for (const r of subsByTier) {
      console.log(`    ${r.tier} (${r.status}): ${r.n}`);
    }
  }
  console.log("");

  console.log("── Money (credit ledger) ──");
  console.log(`  Money in (topup+recharge):  ${usd(money.money_in_micros)}`);
  console.log(`  Granted (free credit):      ${usd(money.granted_micros)}`);
  console.log(`  Referral credit:            ${usd(money.referral_micros)}`);
  console.log(
    `  Outstanding balance (all):  ${usd(money.outstanding_micros)}\n`
  );

  console.log("── Usage (token proxy = $ debited per turn) ──");
  console.log(`  Metered turns (total):      ${debits.turns_total}`);
  console.log(
    `  Metered turns (7d/30d):     ${debits.turns_7d} / ${debits.turns_30d}`
  );
  console.log(`  Inference $ spent (charged):${usd(debits.spent_micros)}`);
  console.log(
    "  ⚠ raw token COUNTS are not stored — see Vercel AI Gateway dashboard.\n"
  );

  console.log("── Engagement ──");
  console.log(`  Chats:                ${chats.n}`);
  console.log(
    `  Messages (total):     ${msgs.total}  (user: ${msgs.user_msgs})`
  );
  console.log(`  Active users (7d):    ${active.n}`);
  console.log(
    `  Referrals:            ${refs.total} (rewarded: ${refs.rewarded})`
  );
  console.log("\n════════════════════════════════════════════════\n");

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
