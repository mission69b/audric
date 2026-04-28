import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { env } from '@/lib/env';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Short fingerprint for log correlation. Never log raw email — the
 *  hash is enough to confirm "same email" across log lines without
 *  putting PII in our log retention. */
function emailHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);
}

/** "0x2314…96cd" — for user-facing copy and operator logs. */
function maskAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * POST /api/user/email
 * Body: { address, email }
 * Stores email + verification token, sends verification email.
 */
export async function POST(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: { address?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address, email } = body;
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const rl = rateLimit(`email:${address}`, 3, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const existing = await prisma.user.findFirst({
    where: { email, NOT: { suiAddress: address } },
    select: { id: true, suiAddress: true },
  });
  if (existing) {
    // [send-safety / auth re-prompt diagnostic] We've seen users hit this
    // 409 after re-logging-in with the same Gmail account from a different
    // deployment URL (preview vs prod). zkLogin is deterministic per
    // (sub + aud + Enoki app), so when the same `sub` produces a different
    // `suiAddress`, the most likely cause is `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
    // (= JWT `aud`) differing between deployments. Logging `aud` + a sub
    // prefix here lets us confirm or rule that out from real reports
    // without putting raw email/sub in retention.
    const claims = ('payload' in jwtResult ? jwtResult.payload : null) ?? null;
    console.warn('[email-conflict]', {
      route: 'POST /api/user/email',
      emailHash: emailHash(email),
      requestedSuiAddress: address,
      existingSuiAddress: existing.suiAddress,
      jwt: claims
        ? {
            aud: claims.aud,
            sub: typeof claims.sub === 'string' ? claims.sub.slice(0, 8) : null,
            iss: claims.iss,
          }
        : null,
      origin: request.headers.get('origin'),
    });
    return NextResponse.json(
      {
        error: 'EMAIL_LINKED_TO_DIFFERENT_WALLET',
        message: `This email is linked to a different wallet (${maskAddress(existing.suiAddress)}).`,
        hint:
          'This usually happens when you previously signed in from a different URL ' +
          '(e.g. a preview link) or selected a different Google account. ' +
          'If you have funds in the previous wallet, please contact support@audric.ai for help recovering them.',
        previousAddressMasked: maskAddress(existing.suiAddress),
      },
      { status: 409 },
    );
  }

  const token = generateToken();
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.user.upsert({
    where: { suiAddress: address },
    create: {
      suiAddress: address,
      email,
      emailVerified: false,
      emailVerifyToken: token,
      emailVerifyExpiry: expiry,
    },
    update: {
      email,
      emailVerified: false,
      emailVerifyToken: token,
      emailVerifyExpiry: expiry,
    },
  });

  const verifyUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai'}/verify?token=${token}`;

  if (resend) {
    try {
      await resend.emails.send({
        from: 'Audric <noreply@audric.ai>',
        to: email,
        subject: 'Verify your email — Audric',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">Verify your email</h2>
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
              Click the button below to verify your email and start receiving daily briefings from Audric.
            </p>
            <a href="${verifyUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Verify email
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 32px; line-height: 1.5;">
              This link expires in 24 hours. If you didn't request this, you can safely ignore it.
            </p>
          </div>
        `,
      });
    } catch (err) {
      console.error('[email] Resend send failed:', err);
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 });
    }
  } else {
    console.log(`[email] RESEND_API_KEY not set. Verification link: ${verifyUrl}`);
  }

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/user/email?address=0x...
 * Returns { email, emailVerified } for polling during verification.
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { email: true, emailVerified: true },
  });

  return NextResponse.json({
    email: user?.email ?? null,
    emailVerified: user?.emailVerified ?? false,
  });
}
