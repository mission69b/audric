import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: 'This email is already registered to another account' }, { status: 409 });
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

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai'}/verify?token=${token}`;

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
