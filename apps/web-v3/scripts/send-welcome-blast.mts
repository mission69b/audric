/**
 * One-off / periodic Welcome-email blast to users who were never welcomed.
 *
 * The Welcome email (sent automatically on first sign-in) is our strongest
 * intro and already links the "Introducing Audric" post — so for the existing
 * base we send that same email rather than a separate announcement.
 *
 * DEDUPE IS THE DB, NOT A LOCAL FILE. Audience = non-anonymous users with an
 * email AND `welcomeEmailSentAt IS NULL`; a successful send stamps that column,
 * so a user is welcomed at most once across this script + the auto-send on
 * sign-in (`app/api/auth/session/route.ts`). Re-run anytime — it only ever
 * targets the genuinely-unwelcomed (e.g. v2 users who signed into v3 but whose
 * auto-welcome never fired), never double-sending.
 *
 * SAFE BY DEFAULT — a bare run is a DRY RUN (prints the audience, sends nothing).
 * Each run also appends a local audit log under scripts/.welcome-blast-runs/.
 *
 * Run with prod creds in .env.local (POSTGRES_URL + RESEND_API_KEY):
 *
 *   # ONE-TIME after the welcomeEmailSentAt migration — stamp everyone the
 *   # 2026-06-22 blast already reached (from .welcome-blast-sent.json) so they
 *   # aren't re-sent:
 *   npx tsx --env-file=.env.local scripts/send-welcome-blast.mts --backfill
 *
 *   # 1) Dry run — see who would get it:
 *   npx tsx --env-file=.env.local scripts/send-welcome-blast.mts
 *
 *   # 2) Test to one real inbox first:
 *   npx tsx --env-file=.env.local scripts/send-welcome-blast.mts --only you@example.com --send
 *
 *   # 3) Send for real (optionally cap with --limit N while ramping):
 *   npx tsx --env-file=.env.local scripts/send-welcome-blast.mts --send
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { ReactElement } from "react";
import { Resend } from "resend";
// This package is CommonJS, so tsx compiles the .tsx template to CJS and the
// named export lands on the default (module.exports) namespace — default-import
// then destructure (a bare `{ WelcomeEmail }` import fails to resolve).
import welcomeTemplate from "../lib/email/templates/welcome";

const { WelcomeEmail } = welcomeTemplate as unknown as {
  WelcomeEmail: (props: { name?: string }) => ReactElement;
};

const FROM = "Audric <hello@audric.ai>";
const REPLY_TO = "hello@audric.ai";
const SUBJECT = "Welcome to Audric";
const THROTTLE_MS = 600; // ~1.6/s — under Resend's default rate limit

const HERE = dirname(fileURLToPath(import.meta.url));
const SENT_LOG = join(HERE, ".welcome-blast-sent.json"); // legacy — read for --backfill only
const RUNS_DIR = join(HERE, ".welcome-blast-runs");
const RUN_LOG = join(RUNS_DIR, `${new Date().toISOString().slice(0, 10)}.log`);

function appendRun(line: string) {
  if (!existsSync(RUNS_DIR)) {
    mkdirSync(RUNS_DIR, { recursive: true });
  }
  appendFileSync(RUN_LOG, `${line}\n`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstName = (name?: string | null) =>
  name?.trim().split(/\s+/)[0] || undefined;

let _sql: ReturnType<typeof postgres> | null = null;
function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres(process.env.POSTGRES_URL ?? "", { max: 1 });
  }
  return _sql;
}

async function audience(): Promise<{ email: string; name: string | null }[]> {
  const rows = await getSql()<{ email: string | null; name: string | null }[]>`
    select email, name
    from "User"
    where email is not null
      and "isAnonymous" = false
      and "welcomeEmailSentAt" is null
    order by "createdAt" asc`;

  // Dedupe by lowercased email (a person may have re-signed in).
  const seen = new Set<string>();
  const out: { email: string; name: string | null }[] = [];
  for (const r of rows) {
    const email = r.email?.trim();
    if (!email) {
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ email, name: r.name });
  }
  return out;
}

/** Stamp welcomeEmailSentAt for one email (idempotent — only when still null). */
async function markSent(email: string) {
  await getSql()`
    update "User" set "welcomeEmailSentAt" = now()
    where lower(email) = ${email.toLowerCase()} and "welcomeEmailSentAt" is null`;
}

/** ONE-TIME: stamp everyone already reached by the pre-migration blast, read
 *  from the legacy .welcome-blast-sent.json, so they aren't re-sent. */
async function backfill(): Promise<number> {
  if (!existsSync(SENT_LOG)) {
    console.log("No .welcome-blast-sent.json — nothing to backfill.");
    return 0;
  }
  const emails = (JSON.parse(readFileSync(SENT_LOG, "utf8")) as string[]).map(
    (e) => e.toLowerCase()
  );
  if (emails.length === 0) {
    return 0;
  }
  const res = await getSql()`
    update "User" set "welcomeEmailSentAt" = now()
    where lower(email) = any(${emails}) and "welcomeEmailSentAt" is null`;
  return res.count;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--backfill")) {
    const n = await backfill();
    console.log(`\n✅ Backfill: stamped welcomeEmailSentAt on ${n} user(s).\n`);
    await getSql().end();
    return;
  }

  const send = args.includes("--send");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx > -1 ? args[onlyIdx + 1] : null;
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx > -1 ? Number(args[limitIdx + 1]) : null;

  let recipients = only
    ? [{ email: only, name: null as string | null }]
    : await audience();
  if (limit != null && Number.isFinite(limit)) {
    recipients = recipients.slice(0, limit);
  }

  console.log(`\n📣 Welcome blast — "${SUBJECT}"`);
  console.log(`   from: ${FROM}`);
  console.log(
    `   audience: ${recipients.length} unwelcomed${only ? " · (--only override)" : ""}`
  );
  console.log(
    "   sample:",
    recipients
      .slice(0, 8)
      .map((r) => r.email)
      .join(", ") || "(none)"
  );

  if (!send) {
    console.log(
      "\n🅳🆁🆈 run — nothing sent. Add --send to deliver (try --only you@example.com --send first).\n"
    );
    await _sql?.end();
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY unset — cannot send.");
  }
  if (recipients.length === 0) {
    console.log("\nNothing to send.\n");
    await _sql?.end();
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  appendRun(
    `# run ${new Date().toISOString()} — "${SUBJECT}" — ${recipients.length} recipients`
  );
  let ok = 0;
  let fail = 0;
  for (const r of recipients) {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: r.email,
      subject: SUBJECT,
      replyTo: REPLY_TO,
      react: WelcomeEmail({ name: firstName(r.name) }),
    });
    if (error) {
      fail++;
      console.log(`  ✗ ${r.email} — ${error.message}`);
      appendRun(`FAIL ${r.email} — ${error.message}`);
    } else {
      ok++;
      // Only mark after a real send (not for --only one-off test addresses that
      // may not be a user row — the update is a no-op then).
      await markSent(r.email);
      console.log(`  ✓ ${r.email} — ${data?.id}`);
      appendRun(`${r.email} — ${data?.id}`);
    }
    await sleep(THROTTLE_MS);
  }
  appendRun(`# done: sent ${ok}, failed ${fail}`);
  console.log(`\nDone. sent ${ok}, failed ${fail}.\n`);
  await getSql().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
