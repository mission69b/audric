/**
 * One-off credit admin: look up a user by email, show tier + credit balance +
 * recent ledger. Optionally grant credit up to a target balance.
 *
 * Self-contained (raw SQL via `postgres`) to avoid the app's server-only imports.
 *
 * READ-ONLY:
 *   npx tsx --env-file=.env.local scripts/credit-admin.mts <email>
 * GRANT (one 'grant' row to reach <targetUsd>):
 *   npx tsx --env-file=.env.local scripts/credit-admin.mts <email> --grant-to <targetUsd>
 */
import postgres from "postgres";

const MICROS = 1_000_000;
const usd = (micros: number) => `$${(micros / MICROS).toFixed(2)}`;

async function main() {
  const email = process.argv[2];
  if (!email) {
    throw new Error("usage: credit-admin.mts <email> [--grant-to <usd>]");
  }
  const gi = process.argv.indexOf("--grant-to");
  const grantToUsd = gi > -1 ? Number(process.argv[gi + 1]) : null;
  const fi = process.argv.indexOf("--grant");
  const grantFixedUsd = fi > -1 ? Number(process.argv[fi + 1]) : null;

  const sql = postgres(process.env.POSTGRES_URL ?? "", { max: 1 });

  const users = await sql`
    select id, email, "subscriptionTier", "subscriptionStatus",
           "stripeCustomerId", "createdAt"
    from "User" where email ilike ${email}`;

  if (users.length === 0) {
    console.log(`No user found for email ~ "${email}"`);
    await sql.end();
    return;
  }
  if (users.length > 1) {
    console.log(`⚠️  ${users.length} users match "${email}"`);
  }

  for (const u of users) {
    const [bal] = await sql`
      select coalesce(sum("amountMicros"), 0) as total
      from "CreditLedger" where "userId" = ${u.id}`;
    const balMicros = Number(bal.total);

    const ledger = await sql`
      select "createdAt", type, "amountMicros", description, ref
      from "CreditLedger" where "userId" = ${u.id}
      order by "createdAt" desc limit 20`;

    console.log("\n================ USER ================");
    console.log(`address:    ${u.id}`);
    console.log(`email:      ${u.email}`);
    console.log(`tier:       ${u.subscriptionTier}`);
    console.log(`subStatus:  ${u.subscriptionStatus ?? "—"}`);
    console.log(`stripeCust: ${u.stripeCustomerId ?? "—"}`);
    console.log(`createdAt:  ${u.createdAt?.toISOString?.() ?? u.createdAt}`);
    console.log(`\nCREDIT BALANCE: ${usd(balMicros)} (${balMicros} micros)`);
    console.log(`\nLEDGER (latest ${ledger.length}):`);
    for (const e of ledger) {
      console.log(
        `  ${e.createdAt?.toISOString?.() ?? e.createdAt}  ${String(
          e.type
        ).padEnd(
          10
        )} ${usd(Number(e.amountMicros)).padStart(10)}  ${e.description ?? ""}${
          e.ref ? ` [ref:${e.ref}]` : ""
        }`
      );
    }

    const doFixed = grantFixedUsd != null && Number.isFinite(grantFixedUsd);
    const doTarget = grantToUsd != null && Number.isFinite(grantToUsd);
    if (doFixed || doTarget) {
      const targetMicros = doFixed
        ? balMicros + Math.round((grantFixedUsd as number) * MICROS)
        : Math.round((grantToUsd as number) * MICROS);
      const deltaMicros = doFixed
        ? Math.round((grantFixedUsd as number) * MICROS)
        : targetMicros - balMicros;
      if (deltaMicros <= 0) {
        console.log(
          `\nGRANT SKIPPED: balance ${usd(balMicros)} already ≥ target ${usd(targetMicros)}`
        );
      } else {
        const ref = `manual-grant:${u.id}:max-credit-migration`;
        const inserted = await sql`
          insert into "CreditLedger" ("userId", "amountMicros", type, description, ref)
          values (${u.id}, ${deltaMicros}, 'grant',
                  ${`Manual grant: top up to ${usd(targetMicros)} (pre-update Max subscriber migration)`},
                  ${ref})
          on conflict (ref) do nothing
          returning id`;
        if (inserted.length > 0) {
          console.log(
            `\n✅ GRANTED ${usd(deltaMicros)} → new balance ${usd(targetMicros)} (ledger id ${inserted[0].id})`
          );
        } else {
          console.log(
            `\n⏭️  GRANT already applied (ref ${ref}) — idempotent no-op.`
          );
        }
      }
    }
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
