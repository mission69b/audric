import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
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
      <a href="https://audric.ai/action?type=repay" style="display: inline-block; background: #dc2626; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; margin-top: 8px;">
        Repay now →
      </a>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin-top: 20px;">
        <strong>What does this mean?</strong> Your health factor measures how safe your
        collateral is relative to your debt. Below 1.0, your position can be liquidated
        — meaning you lose a portion of your savings to cover the debt automatically.
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        You're receiving this because you have an active credit position on Audric.
        <a href="https://audric.ai/settings?section=features" style="color: #9ca3af;">Manage notifications</a>
      </p>
    </div>
  `;
}

/**
 * POST /api/internal/hf-alert
 * Called by the t2000 indexer when a critical HF is detected real-time.
 * Looks up the user by wallet address and sends an urgent email.
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  let body: {
    walletAddress: string;
    healthFactor: number;
    debtBalance: number;
    level: string;
    triggeredAt: string;
  };
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
    select: {
      id: true,
      email: true,
      emailVerified: true,
      notificationPrefs: {
        where: { feature: 'hf_alert' },
        select: { enabled: true, lastSentAt: true },
      },
    },
  });

  if (!user?.email || !user.emailVerified) {
    return NextResponse.json({ ok: true, skipped: 'no_verified_email' });
  }

  const hfPref = user.notificationPrefs[0];
  if (hfPref?.enabled === false) {
    return NextResponse.json({ ok: true, skipped: 'opted_out' });
  }

  if (hfPref?.lastSentAt && Date.now() - hfPref.lastSentAt.getTime() < DEDUP_CRITICAL_MS) {
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

    await prisma.notificationPrefs.upsert({
      where: { userId_feature: { userId: user.id, feature: 'hf_alert' } },
      update: { lastSentAt: new Date() },
      create: { userId: user.id, feature: 'hf_alert', enabled: true, lastSentAt: new Date() },
    });

    prisma.appEvent?.create({
      data: {
        address: walletAddress,
        type: 'alert',
        title: `Health factor dropped to ${healthFactor.toFixed(2)}`,
        details: { healthFactor, debtBalance, level },
      },
    }).catch((err: unknown) => console.error('[hf-alert] AppEvent write failed:', err));

    return NextResponse.json({ ok: true, sent: true });
  } catch (err) {
    console.error('[hf-alert] Email send failed:', err);
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 });
  }
}
