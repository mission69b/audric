import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

// [SIMPLIFICATION DAY 5 — restored post-S.5 audit]
//
// Critical-HF email dispatch. Called by the t2000 indexer hook
// (apps/server/src/indexer/hfHook.ts) on every borrow/repay/save/withdraw
// when a user's health factor crosses into critical territory (HF < 1.2).
//
// Without this endpoint, users get liquidated silently — which is the only
// proactive notification the simplification spec explicitly preserved.
//
// What changed vs the pre-S.5 version:
//  - Dedup no longer reads/writes `NotificationPrefs.lastSentAt` (table dropped).
//    The indexer hook itself already dedups by address with a 30min in-memory
//    Map (`lastCriticalSent` in hfHook.ts), so a second layer here would only
//    matter across cold-starts. Belt-and-braces dedup added below via a recent
//    AppEvent lookup — same wallet, same alert type, within 30min → skip.
//  - No notification opt-out preference (NotificationPrefs gone). Users with
//    a critical HF ALWAYS get the email. This is safety, not marketing.
//  - Email send remains identical.
//  - AppEvent write remains (used by the activity feed).

function getResend(): Resend | null {
  const key = env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

const DEDUP_CRITICAL_MS = 30 * 60 * 1000;

function buildCriticalHFEmail(hf: number, debtBalance: number): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="background: #dc262615; border-left: 4px solid #dc2626; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h2 style="margin: 0 0 8px; color: #dc2626; font-size: 18px;">🚨 Critical: your health factor is dangerously low</h2>
        <p style="margin: 0; color: #374151; font-size: 14px;">
          Health factor: <strong>${hf.toFixed(2)}</strong> — liquidation risk is high.
        </p>
      </div>
      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        You have <strong>$${debtBalance.toFixed(2)}</strong> in outstanding debt.
        Repay some now to bring your health factor back to a safe level.
      </p>
      <a href="https://audric.ai" style="display: inline-block; background: #dc2626; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; margin-top: 8px;">
        Open Audric →
      </a>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin-top: 20px;">
        <strong>What does this mean?</strong> Your health factor measures how safe your
        collateral is relative to your debt. Below 1.0, your position can be liquidated
        — meaning you lose a portion of your savings to cover the debt automatically.
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        You're receiving this because you have an active credit position on Audric.
      </p>
    </div>
  `;
}

interface AlertBody {
  walletAddress: string;
  healthFactor: number;
  debtBalance: number;
  level: string;
  triggeredAt: string;
}

export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  let body: AlertBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { walletAddress, healthFactor, debtBalance, level } = body;

  if (!walletAddress || level !== 'critical') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: walletAddress },
    select: { id: true, email: true, emailVerified: true },
  });

  if (!user?.email || !user.emailVerified) {
    return NextResponse.json({ ok: true, skipped: 'no_verified_email' });
  }

  const recentAlert = await prisma.appEvent.findFirst({
    where: {
      address: walletAddress,
      type: 'alert',
      createdAt: { gte: new Date(Date.now() - DEDUP_CRITICAL_MS) },
    },
    select: { id: true },
  });
  if (recentAlert) {
    return NextResponse.json({ ok: true, skipped: 'dedup' });
  }

  const resendClient = getResend();
  if (!resendClient) {
    console.log(`[hf-alert] RESEND_API_KEY not set. Would email ${user.email} about HF=${healthFactor}`);
    return NextResponse.json({ ok: true, skipped: 'no_resend' });
  }

  try {
    await resendClient.emails.send({
      from: 'Audric <notifications@audric.ai>',
      to: user.email,
      subject: `🚨 Critical: health factor at ${healthFactor.toFixed(2)}`,
      html: buildCriticalHFEmail(healthFactor, debtBalance),
    });

    await prisma.appEvent.create({
      data: {
        address: walletAddress,
        type: 'alert',
        title: `Health factor dropped to ${healthFactor.toFixed(2)}`,
        details: { healthFactor, debtBalance, level },
        source: 'system',
      },
    }).catch((err: unknown) => console.error('[hf-alert] AppEvent write failed:', err));

    return NextResponse.json({ ok: true, sent: true });
  } catch (err) {
    console.error('[hf-alert] Email send failed:', err);
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 });
  }
}
