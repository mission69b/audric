import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/generated/prisma/client';
import {
  parseContactList,
  serializeContactList,
} from '@/lib/identity/contact-schema';
import { backfillAudricUsernames } from '@/lib/identity/contact-suins-backfill';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getSuiRpcUrl } from '@/lib/sui-rpc';

export const runtime = 'nodejs';

/**
 * POST /api/user/preferences/contacts/backfill
 *
 * SPEC 10 D.4 — Triggers a reverse-SuiNS enrichment pass on the user's
 * saved contacts. For each contact whose `audricUsername` field is unset
 * (or `null` — re-checked cheaply), look up reverse SuiNS for the
 * `resolvedAddress` and pick the first `*.audric.sui` leaf if any.
 * Persists changes to `UserPreferences.contacts` and returns the updated
 * list using the same widened shape as `GET /api/user/preferences`.
 *
 * Why a separate endpoint (not part of GET): the backfill does N
 * sequential RPC calls (~50ms each, batched 4-wide) — adding ~250-500ms
 * to every preferences GET would noticeably regress dashboard load time.
 * Splitting it into a client-triggered POST lets the page render the
 * existing contact list immediately, then asynchronously upgrade with
 * 🪪 badges as they arrive.
 *
 * Triggered from `useContacts` once per session if the initial GET
 * shows any contacts with `audricUsername === null`.
 *
 * Auth: matches the existing `/api/user/preferences` POST — wide-open by
 * address (pre-existing pattern, not introduced here). IP-throttled to
 * 10 backfills per minute to bound RPC fan-out under hostile load.
 *
 * Body: { address: string }
 * Response: { contacts: [...widened shape], changed, attempted, hits, errored }
 */

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function ipKey(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(
    `contacts-backfill:${ipKey(req)}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!limit.success) {
    return rateLimitResponse(
      limit.retryAfterMs ?? RATE_LIMIT_WINDOW_MS,
    ) as NextResponse;
  }

  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { address } = body;
  if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const prefs = await prisma.userPreferences.findUnique({
    where: { address },
    select: { contacts: true },
  });
  if (!prefs) {
    return NextResponse.json({
      contacts: [],
      changed: false,
      attempted: 0,
      hits: 0,
      errored: 0,
    });
  }

  const parsed = parseContactList(prefs.contacts);
  const result = await backfillAudricUsernames(parsed, {
    suiRpcUrl: getSuiRpcUrl(),
    signal: req.signal,
  });

  if (result.changed) {
    const serialized = serializeContactList(result.contacts);
    await prisma.userPreferences.update({
      where: { address },
      data: { contacts: serialized as unknown as Prisma.InputJsonValue },
    });
  }

  const contactsForClient = result.contacts.map((c) => ({
    name: c.name,
    address: c.identifier,
    identifier: c.identifier,
    resolvedAddress: c.resolvedAddress,
    audricUsername: c.audricUsername ?? null,
    addedAt: c.addedAt ?? null,
    source: c.source ?? null,
  }));

  return NextResponse.json({
    contacts: contactsForClient,
    changed: result.changed,
    attempted: result.attempted,
    hits: result.hits,
    errored: result.errored,
  });
}
