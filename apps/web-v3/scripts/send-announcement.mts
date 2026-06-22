/**
 * One-off launch announcement send to existing Audric users.
 *
 * Audience: non-anonymous users with an email (deduped, oldest first).
 * Founder-from, links the "Introducing Audric" post. Renders the real
 * AnnouncementEmail template through Resend.
 *
 * SAFE BY DEFAULT — a bare run is a DRY RUN (prints the audience, sends nothing).
 * Idempotent: every successful send is recorded in scripts/.announcement-sent.json
 * and skipped on re-run, so an interrupted run resumes cleanly.
 *
 * Run with prod creds in .env.local (POSTGRES_URL + RESEND_API_KEY):
 *
 *   # 1) Dry run — see who would get it:
 *   npx tsx --env-file=.env.local scripts/send-announcement.mts
 *
 *   # 2) Test to one real inbox first:
 *   npx tsx --env-file=.env.local scripts/send-announcement.mts --only you@example.com --send
 *
 *   # 3) Send for real (optionally cap with --limit N while ramping):
 *   npx tsx --env-file=.env.local scripts/send-announcement.mts --send
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { Resend } from "resend";
// This package is CommonJS, so tsx compiles the .tsx template to CJS and the
// named export lands on the default (module.exports) namespace — default-import
// then destructure (a bare `{ AnnouncementEmail }` import fails to resolve).
import announcementTemplate from "../lib/email/templates/announcement";

const { AnnouncementEmail } = announcementTemplate as unknown as {
  AnnouncementEmail: (props: { name?: string }) => ReactElement;
};

const FROM = "Audric <hello@audric.ai>";
const REPLY_TO = "hello@audric.ai";
const SUBJECT = "Why we built Audric — and what's new";
const THROTTLE_MS = 600; // ~1.6/s — under Resend's default rate limit

const HERE = dirname(fileURLToPath(import.meta.url));
const SENT_LOG = join(HERE, ".announcement-sent.json");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstName = (name?: string | null) =>
  name?.trim().split(/\s+/)[0] || undefined;

function loadSent(): Set<string> {
  if (!existsSync(SENT_LOG)) {
    return new Set();
  }
  try {
    return new Set(JSON.parse(readFileSync(SENT_LOG, "utf8")) as string[]);
  } catch {
    return new Set();
  }
}
function persistSent(sent: Set<string>) {
  writeFileSync(SENT_LOG, JSON.stringify([...sent], null, 2));
}

async function audience(): Promise<{ email: string; name: string | null }[]> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.POSTGRES_URL ?? "", { max: 1 });
  const rows = await sql<{ email: string | null; name: string | null }[]>`
    select email, name
    from "User"
    where email is not null and "isAnonymous" = false
    order by "createdAt" asc`;
  await sql.end();

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

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes("--send");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx > -1 ? args[onlyIdx + 1] : null;
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx > -1 ? Number(args[limitIdx + 1]) : null;

  let recipients = only
    ? [{ email: only, name: null as string | null }]
    : await audience();

  const sent = loadSent();
  const already = recipients.filter((r) => sent.has(r.email.toLowerCase()));
  recipients = recipients.filter((r) => !sent.has(r.email.toLowerCase()));
  if (limit != null && Number.isFinite(limit)) {
    recipients = recipients.slice(0, limit);
  }

  console.log(`\n📣 Announcement — "${SUBJECT}"`);
  console.log(`   from: ${FROM}`);
  console.log(
    `   audience: ${recipients.length} to send` +
      (already.length ? ` · ${already.length} already sent (skipped)` : "") +
      (only ? " · (--only override)" : "")
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
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY unset — cannot send.");
  }
  if (recipients.length === 0) {
    console.log("\nNothing to send.\n");
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let ok = 0;
  let fail = 0;
  for (const r of recipients) {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: r.email,
      subject: SUBJECT,
      replyTo: REPLY_TO,
      react: AnnouncementEmail({ name: firstName(r.name) }),
    });
    if (error) {
      fail++;
      console.log(`  ✗ ${r.email} — ${error.message}`);
    } else {
      ok++;
      sent.add(r.email.toLowerCase());
      persistSent(sent);
      console.log(`  ✓ ${r.email} — ${data?.id}`);
    }
    await sleep(THROTTLE_MS);
  }
  console.log(`\nDone. sent ${ok}, failed ${fail}.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
