import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

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

  // TODO: Send verification email via Resend when configured
  // For now, log the verification link for development
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai'}/verify?token=${token}`;
  console.log(`[email] Verification link for ${email}: ${verifyUrl}`);

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/user/email-status?address=0x...
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
