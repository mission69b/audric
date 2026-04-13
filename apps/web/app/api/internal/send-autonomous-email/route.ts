import { NextRequest, NextResponse } from 'next/server';
import { validateInternalKey } from '@/lib/internal-auth';
import { prisma } from '@/lib/prisma';
import { isValidSuiAddress } from '@/lib/auth';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FROM_ADDRESS = 'Audric <notifications@audric.ai>';

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const PATTERN_LABELS: Record<string, string> = {
  recurring_save: 'recurring save',
  yield_reinvestment: 'yield reinvestment',
  debt_discipline: 'debt repayment',
  idle_usdc_tolerance: 'idle USDC sweep',
  swap_pattern: 'regular swap',
};

function buildStage2Email(data: Record<string, unknown>): { subject: string; html: string } {
  const actionType = data.actionType as string;
  const amount = data.amount as number;
  const asset = data.asset as string;
  const patternLabel = PATTERN_LABELS[(data.patternType as string) ?? ''] ?? actionType;
  const execNum = data.executionNumber as number;
  const reqd = data.confirmationsRequired as number;

  return {
    subject: `Audric auto-${actionType}: $${amount} ${asset}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="font-size: 18px; margin-bottom: 8px;">Auto-${actionType} executed</h2>
        <p style="color: #666; font-size: 14px; line-height: 1.5;">
          Your ${patternLabel} automation just ran: <strong>$${amount} ${asset}</strong>.
        </p>
        <p style="color: #888; font-size: 13px;">
          Execution ${execNum} of ${reqd} before going fully automatic.
        </p>
        <div style="margin-top: 20px;">
          <a href="https://audric.ai/chat/new?q=Show+my+automation+status" style="display: inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px;">View in Audric</a>
          <a href="https://audric.ai/settings?section=schedules" style="display: inline-block; padding: 10px 20px; border: 1px solid #ddd; color: #333; text-decoration: none; border-radius: 6px; font-size: 13px; margin-left: 8px;">Pause this</a>
        </div>
        <p style="color: #aaa; font-size: 11px; margin-top: 24px;">Audric — your financial agent on Sui</p>
      </div>
    `,
  };
}

function buildStage3UnexpectedEmail(data: Record<string, unknown>): { subject: string; html: string } {
  const actionType = data.actionType as string;
  const amount = data.amount as number;
  const asset = data.asset as string;
  const reason = data.reason as string;
  const patternLabel = PATTERN_LABELS[(data.patternType as string) ?? ''] ?? actionType;

  let reasonText = 'an unexpected issue';
  if (reason?.includes('insufficient_balance')) {
    const match = reason.match(/have \$([\d.]+)/);
    reasonText = `low balance${match ? ` ($${match[1]})` : ''}`;
  } else if (reason?.includes('health_factor')) {
    reasonText = 'health factor too low';
  } else if (reason?.includes('daily_limit')) {
    reasonText = 'daily limit reached';
  }

  return {
    subject: `Audric: ${patternLabel} skipped — ${reasonText}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="font-size: 18px; margin-bottom: 8px;">Auto-${actionType} skipped</h2>
        <p style="color: #666; font-size: 14px; line-height: 1.5;">
          Your ${patternLabel} ($${amount} ${asset}) was skipped due to <strong>${reasonText}</strong>.
        </p>
        <div style="margin-top: 20px;">
          <a href="https://audric.ai/chat/new?q=Why+was+my+auto-${actionType}+skipped" style="display: inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px;">Check details</a>
          <a href="https://audric.ai/settings?section=schedules" style="display: inline-block; padding: 10px 20px; border: 1px solid #ddd; color: #333; text-decoration: none; border-radius: 6px; font-size: 13px; margin-left: 8px;">Edit amount</a>
        </div>
        <p style="color: #aaa; font-size: 11px; margin-top: 24px;">Audric — your financial agent on Sui</p>
      </div>
    `,
  };
}

function buildCircuitBreakerEmail(data: Record<string, unknown>): { subject: string; html: string } {
  const actionType = data.actionType as string;
  const patternLabel = PATTERN_LABELS[(data.patternType as string) ?? ''] ?? actionType;
  const failures = data.failures as number;

  return {
    subject: `Audric: ${patternLabel} paused (${failures} failures)`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="font-size: 18px; margin-bottom: 8px;">Automation paused</h2>
        <p style="color: #666; font-size: 14px; line-height: 1.5;">
          Your ${patternLabel} has been paused after <strong>${failures} consecutive failures</strong>.
        </p>
        <p style="color: #888; font-size: 13px;">
          This usually means your balance is consistently too low or conditions keep failing. Check your settings to resume or adjust.
        </p>
        <div style="margin-top: 20px;">
          <a href="https://audric.ai/settings?section=schedules" style="display: inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px;">Check settings</a>
        </div>
        <p style="color: #aaa; font-size: 11px; margin-top: 24px;">Audric — your financial agent on Sui</p>
      </div>
    `,
  };
}

/**
 * POST /api/internal/send-autonomous-email
 * Body: { address, templateType, data }
 * Sends an autonomous action notification email.
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body?.address || !body?.templateType) {
    return NextResponse.json({ error: 'address and templateType required' }, { status: 400 });
  }

  const { address, templateType, data } = body as {
    address: string;
    templateType: string;
    data: Record<string, unknown>;
  };

  if (!isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { email: true, emailVerified: true },
  });

  if (!user?.email || !user.emailVerified) {
    return NextResponse.json({ skipped: true, reason: 'no_verified_email' });
  }

  let email: { subject: string; html: string };
  switch (templateType) {
    case 'stage2_execution':
      email = buildStage2Email(data);
      break;
    case 'stage3_unexpected':
      email = buildStage3UnexpectedEmail(data);
      break;
    case 'circuit_breaker':
      email = buildCircuitBreakerEmail(data);
      break;
    default:
      return NextResponse.json({ error: `Unknown template: ${templateType}` }, { status: 400 });
  }

  const resend = getResend();
  if (!resend) {
    console.warn('[autonomous-email] RESEND_API_KEY not set, skipping');
    return NextResponse.json({ skipped: true, reason: 'no_api_key' });
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: user.email,
      subject: email.subject,
      html: email.html,
    });
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error('[autonomous-email] Send error:', err);
    return NextResponse.json({ sent: false, error: 'send_failed' }, { status: 500 });
  }
}
