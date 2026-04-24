import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/** Last 8 chars only — enough to correlate "this same token was tried
 *  N times" without putting the whole token in retention. */
function tokenFingerprint(token: string): string {
  return token.length > 8 ? `…${token.slice(-8)}` : token;
}

/**
 * POST /api/user/verify-email
 * Body: { token }
 * Verifies email address using the token from the verification link.
 */
export async function POST(request: NextRequest) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token } = body;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
    select: { id: true, emailVerifyExpiry: true, emailVerified: true },
  });

  if (!user) {
    // [auth re-prompt diagnostic] Symmetry with /api/user/email's
    // [email-conflict] log. A missing token can mean the user clicked
    // a stale link OR the token was already consumed by a different
    // (re-derived) wallet — useful signal when investigating
    // "logged in again, got an error" reports.
    console.warn('[email-conflict]', {
      route: 'POST /api/user/verify-email',
      reason: 'invalid_or_unknown_token',
      token: tokenFingerprint(token),
      origin: request.headers.get('origin'),
    });
    return NextResponse.json({ error: 'Invalid or expired verification link' }, { status: 400 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  if (user.emailVerifyExpiry && user.emailVerifyExpiry < new Date()) {
    console.warn('[email-conflict]', {
      route: 'POST /api/user/verify-email',
      reason: 'token_expired',
      token: tokenFingerprint(token),
      origin: request.headers.get('origin'),
    });
    return NextResponse.json({ error: 'This verification link has expired. Request a new one from Settings.' }, { status: 410 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpiry: null,
    },
  });

  return NextResponse.json({ ok: true });
}
