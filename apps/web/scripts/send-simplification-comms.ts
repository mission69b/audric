/**
 * Simplification comms — Day 15 (S.15)
 *
 * One-off script to send the Appendix A email from
 * AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md to active users.
 *
 * Audience: every User where (emailVerified = true) AND (a SessionUsage row
 * exists in the last 30 days). We send only to verified emails — we never
 * promised to email unverified addresses.
 *
 * Usage:
 *   pnpm tsx scripts/send-simplification-comms.ts                  # dry-run
 *   pnpm tsx scripts/send-simplification-comms.ts --send           # real send
 *   pnpm tsx scripts/send-simplification-comms.ts --send --to=ADDRESS
 *                                                                  # single test
 *
 * Idempotency: writes scripts/.simplification-comms-sent.json with the list of
 * suiAddresses we've already sent to. Re-runs skip those addresses. Delete the
 * file to force a re-send.
 *
 * NOT routed through any deleted notification API. NOT routed through cron.
 * NOT routed through the deleted notification-users endpoint. Direct Resend.
 */
import { config } from 'dotenv';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { Resend as ResendType } from 'resend';

const SCRIPT_DIR = __dirname;
config({ path: join(SCRIPT_DIR, '..', '.env.local'), override: true });

const SENT_LOG_PATH = join(SCRIPT_DIR, '.simplification-comms-sent.json');

const ACTIVE_WINDOW_DAYS = 30;
const FROM_EMAIL = 'Funkii <funkii@audric.ai>';
const REPLY_TO = 'funkii@audric.ai';
const SUBJECT = 'A note about Audric';

interface Recipient {
  userId: string;
  email: string;
  suiAddress: string;
}

interface SentLog {
  sentAt: string;
  recipients: Array<{ suiAddress: string; email: string; resendId: string }>;
  skippedAlreadySent: string[];
}

function buildEmailBody(suiAddress: string): { text: string; html: string } {
  const text = `Hey,

Quick note — I cleaned Audric up. Anything that pretended to run
without you is gone: morning briefings, scheduled actions, rate
alerts, auto-compound, the features budget. zkLogin needs your tap
to sign, so calling those "autonomous" wasn't honest.

Audric is now organised around four things:

  Audric Finance — save, send, swap, borrow, repay, withdraw. Same
  as before, all by asking in chat.

  Audric Pay — send USDC. To people, to wallets, to anywhere on
  Sui. Same chat.

  Audric Intelligence — the silent layer. Your financial profile,
  conversation memory, chain memory, AdviceLog. Shapes my replies
  but never surfaces as a notification.

  Audric Store — creator marketplace at audric.ai/your-name. Sell
  AI-generated music, art, ebooks in USDC. Coming soon.

Your wallet, savings, and positions are unchanged. Any features-budget
USDC is back at ${suiAddress}.

— Funkii
`;

  const html = `<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111; line-height: 1.65; font-size: 15px;">
  <p>Hey,</p>
  <p>Quick note — I cleaned Audric up. Anything that pretended to run without you is gone: morning briefings, scheduled actions, rate alerts, auto-compound, the features budget. zkLogin needs your tap to sign, so calling those "autonomous" wasn't honest.</p>
  <p>Audric is now organised around four things:</p>
  <p style="margin: 16px 0;"><strong>Audric Finance</strong> — save, send, swap, borrow, repay, withdraw. Same as before, all by asking in chat.</p>
  <p style="margin: 16px 0;"><strong>Audric Pay</strong> — send USDC. To people, to wallets, to anywhere on Sui. Same chat.</p>
  <p style="margin: 16px 0;"><strong>Audric Intelligence</strong> — the silent layer. Your financial profile, conversation memory, chain memory, AdviceLog. Shapes my replies but never surfaces as a notification.</p>
  <p style="margin: 16px 0;"><strong>Audric Store</strong> — creator marketplace at audric.ai/your-name. Sell AI-generated music, art, ebooks in USDC. Coming soon.</p>
  <p>Your wallet, savings, and positions are unchanged. Any features-budget USDC is back at <code style="background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${suiAddress}</code>.</p>
  <p style="margin-top: 32px;">— Funkii</p>
</div>`;

  return { text, html };
}

function loadSentLog(): SentLog | null {
  if (!existsSync(SENT_LOG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SENT_LOG_PATH, 'utf8')) as SentLog;
  } catch {
    return null;
  }
}

function saveSentLog(log: SentLog): void {
  writeFileSync(SENT_LOG_PATH, JSON.stringify(log, null, 2));
}

async function loadAudience(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  singleAddress?: string
): Promise<Recipient[]> {
  if (singleAddress) {
    const user = await prisma.user.findUnique({
      where: { suiAddress: singleAddress },
      select: { id: true, email: true, suiAddress: true, emailVerified: true },
    });
    if (!user || !user.email || !user.emailVerified) {
      throw new Error(`User ${singleAddress} not found or not verified`);
    }
    return [{ userId: user.id, email: user.email, suiAddress: user.suiAddress }];
  }

  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const recentSessions = await prisma.sessionUsage.findMany({
    where: { createdAt: { gte: cutoff } },
    select: { address: true },
    distinct: ['address'],
  });
  const activeAddresses = new Set(recentSessions.map((s) => s.address));

  const users = await prisma.user.findMany({
    where: {
      emailVerified: true,
      email: { not: null },
      suiAddress: { in: Array.from(activeAddresses) },
    },
    select: { id: true, email: true, suiAddress: true },
    orderBy: { createdAt: 'asc' },
  });

  return users.flatMap<Recipient>((u) =>
    u.email ? [{ userId: u.id, email: u.email, suiAddress: u.suiAddress }] : []
  );
}

async function getPrisma() {
  const { prisma } = await import('../lib/prisma');
  return prisma;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const sendForReal = args.has('--send');
  const toArg = process.argv.find((a) => a.startsWith('--to='));
  const singleAddress = toArg?.slice('--to='.length);

  const prisma = await getPrisma();
  const log = loadSentLog();
  const alreadySent = new Set<string>(log?.recipients.map((r) => r.suiAddress) ?? []);

  console.log('───────────────────────────────────────────────────────────────');
  console.log('Audric simplification comms — Day 15');
  console.log(`Mode: ${sendForReal ? '🔥 LIVE SEND' : '🧪 DRY RUN'}`);
  console.log(`Active window: ${ACTIVE_WINDOW_DAYS} days`);
  if (singleAddress) console.log(`Single recipient: ${singleAddress}`);
  console.log(`Already-sent log: ${alreadySent.size} addresses`);
  console.log('───────────────────────────────────────────────────────────────');

  const audience = await loadAudience(prisma, singleAddress);
  const fresh = audience.filter((r) => !alreadySent.has(r.suiAddress));

  console.log(`\nAudience: ${audience.length} verified-email users`);
  console.log(`Fresh (not previously sent): ${fresh.length}`);
  console.log(`Skipping (already sent): ${audience.length - fresh.length}`);

  if (fresh.length === 0) {
    console.log('\nNothing to send. Exiting.');
    await prisma.$disconnect();
    return;
  }

  console.log('\nFirst 5 recipients (preview):');
  for (const r of fresh.slice(0, 5)) {
    console.log(`  ${r.email}  →  ${r.suiAddress}`);
  }
  if (fresh.length > 5) console.log(`  … and ${fresh.length - 5} more`);

  if (!sendForReal) {
    console.log('\n🧪 Dry run — no emails sent. Re-run with --send to send for real.');
    await prisma.$disconnect();
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('\n❌ RESEND_API_KEY not set. Aborting.');
    process.exit(1);
  }
  const { Resend } = await import('resend');
  const resend: ResendType = new Resend(apiKey);

  const sentRecipients: Array<{ suiAddress: string; email: string; resendId: string }> = [];
  const failures: Array<{ suiAddress: string; email: string; error: string }> = [];

  for (let i = 0; i < fresh.length; i++) {
    const r = fresh[i];
    const { text, html } = buildEmailBody(r.suiAddress);
    try {
      const res = await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: r.email,
        subject: SUBJECT,
        text,
        html,
      });
      const id = res.data?.id ?? 'unknown';
      sentRecipients.push({ suiAddress: r.suiAddress, email: r.email, resendId: id });
      console.log(`  [${i + 1}/${fresh.length}] ✅  ${r.email}  →  ${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ suiAddress: r.suiAddress, email: r.email, error: msg });
      console.error(`  [${i + 1}/${fresh.length}] ❌  ${r.email}  →  ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  const newLog: SentLog = {
    sentAt: new Date().toISOString(),
    recipients: [...(log?.recipients ?? []), ...sentRecipients],
    skippedAlreadySent: Array.from(alreadySent),
  };
  saveSentLog(newLog);

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`Sent: ${sentRecipients.length}`);
  console.log(`Failed: ${failures.length}`);
  console.log(`Log written to: ${SENT_LOG_PATH}`);
  console.log('───────────────────────────────────────────────────────────────');

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f.email}  →  ${f.error}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
