/**
 * Read-ONLY referral inspector — verify a referral flow end-to-end against the
 * (prod) DB after running the real signup + top-up on audric.ai. No writes, no
 * charges. Self-contained raw SQL (avoids server-only imports), same pattern as
 * credit-admin.mts.
 *
 *   npx tsx --env-file=.env.local scripts/referral-inspect.mts <referrerEmail> <refereeEmail>
 *   npx tsx --env-file=.env.local scripts/referral-inspect.mts <anyEmail>   # single-user view
 */
import postgres from "postgres";

const MICROS = 1_000_000;
const usd = (m: number) => `$${(m / MICROS).toFixed(2)}`;

async function userByEmail(sql: ReturnType<typeof postgres>, email: string) {
  const [u] = await sql`
    select id, email, "referralCode", "referredBy", "createdAt"
    from "User" where email ilike ${email} limit 1`;
  return u;
}

async function dumpUser(
  sql: ReturnType<typeof postgres>,
  label: string,
  email: string
) {
  const u = await userByEmail(sql, email);
  if (!u) {
    console.log(`\n${label}: no user for "${email}"`);
    return null;
  }
  const [bal] = await sql`
    select coalesce(sum("amountMicros"),0) as t from "CreditLedger" where "userId" = ${u.id}`;
  const refRows = await sql`
    select type, "amountMicros", description, ref, "createdAt"
    from "CreditLedger" where "userId" = ${u.id} and type = 'referral'
    order by "createdAt" desc`;
  console.log(`\n=== ${label}: ${u.email} ===`);
  console.log(`  id:          ${u.id}`);
  console.log(`  referralCode:${u.referralCode ?? "— (none yet)"}`);
  console.log(`  referredBy:  ${u.referredBy ?? "—"}`);
  console.log(`  balance:     ${usd(Number(bal.t))}`);
  console.log(`  referral ledger rows: ${refRows.length}`);
  for (const r of refRows) {
    console.log(
      `    ${r.type}  ${usd(Number(r.amountMicros))}  ${r.description}  [${r.ref}]`
    );
  }
  return u;
}

async function main() {
  const a = process.argv[2];
  const b = process.argv[3];
  if (!a) {
    throw new Error(
      "usage: referral-inspect.mts <referrerEmail> [refereeEmail]"
    );
  }
  const sql = postgres(process.env.POSTGRES_URL ?? "", { max: 1 });

  const referrer = await dumpUser(sql, "REFERRER", a);
  const referee = b ? await dumpUser(sql, "REFEREE", b) : null;

  if (referrer) {
    const stats = await sql`
      select status, count(*) as c from "Referral"
      where "referrerId" = ${referrer.id} group by status`;
    console.log(`\n=== REFERRER stats (${referrer.email}) ===`);
    for (const s of stats) {
      console.log(`  ${s.status}: ${s.c}`);
    }
  }

  if (referee) {
    const [row] = await sql`
      select "referrerId", "refereeId", code, status, "rewardedAt", "createdAt"
      from "Referral" where "refereeId" = ${referee.id} limit 1`;
    console.log("\n=== Referral row (by referee) ===");
    console.log(row ? row : "  (none — attribution did not happen)");
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
