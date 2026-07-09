import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const url = envText.match(/^POSTGRES_URL=(.*)$/m)[1].replace(/^"|"$/g, "");
const sql = postgres(url, { max: 1 });
const OWNER = "0x7f2059fb1c395f4800809b4b97ed8e661535c8c55f89b1379b6b9d0208d2f6dc";
const rows = await sql`
  select "numericId", "displayName", name, address, active, owner, "pendingOwner"
  from "AgentProfile"
  where owner = ${OWNER} or "pendingOwner" = ${OWNER} or address = ${OWNER}
  order by "numericId"`;
for (const r of rows) {
  console.log(
    String(r.numericId).padStart(3),
    (r.displayName ?? r.name).padEnd(22),
    r.address.slice(0, 10),
    r.active ? "ACTIVE  " : "inactive",
    r.pendingOwner === OWNER ? "PENDING" : "owned"
  );
}
await sql.end();
