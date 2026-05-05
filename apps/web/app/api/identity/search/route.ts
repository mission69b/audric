import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * GET /api/identity/search?q=al&limit=10
 *
 * SPEC 10 Phase C.3 — Send-modal `@`-autocomplete data source.
 *
 * Returns up to `limit` (default 10, max 25) Audric users whose
 * `username` starts with `q`. Used by `<SendRecipientInput>` to surface
 * a dropdown when the user types `@` followed by 1+ characters.
 *
 * Response shape:
 *   200 { results: [{ username, fullHandle, address, claimedAt }] }
 *
 * Each row includes:
 *   - `username`            — the bare label (e.g. "alice")
 *   - `fullHandle`          — `${username}.audric.sui` (the D10 display form)
 *   - `address`             — the resolved 0x address (for direct send dispatch)
 *   - `claimedAt`           — ISO timestamp (rendered as "claimed Xd ago" hint
 *                             in the dropdown row)
 *
 * Error responses:
 *   400 { error } — missing/empty `q` parameter, or `q` not a non-empty string
 *   429 { error } — IP rate limit exceeded
 *
 * Validation:
 *   - `q` is trimmed + lowercased + character-restricted to a-z0-9 + hyphen
 *     (the SuiNS label charset). Anything else returns an empty results list
 *     rather than an error — the autocomplete should silently ignore typos
 *     ("@al!ce" → no results) without surfacing a 400 mid-typing.
 *   - `limit` is clamped to [1, 25].
 *
 * Rate limit: 60 requests / 60s per IP. Generous enough for typing-debounced
 * autocomplete (typically ~5 lookups per send-flow session) while bounding
 * against scraping the entire username table.
 *
 * Auth: unauthenticated. The "who has registered an Audric handle" question
 * reveals only what's already public on-chain (every leaf subname is
 * resolvable via `suix_resolveNameServiceAddress`); plus, the send-modal
 * use case happens BEFORE the user-message reaches the engine, so requiring
 * a JWT would add session-expiry friction during a chip-flow input.
 *
 * Why prefix-match on `User.username` instead of full-text search:
 *   - The autocomplete matches on the START of the handle ("al" → "alice",
 *     "alex", "alpha") — substring match would surface unexpected hits
 *     and degrade the "type-to-narrow" mental model.
 *   - Postgres `LIKE 'al%'` uses the indexed `username` column directly;
 *     full-text would need a separate tsvector index for marginal value.
 *
 * Why no engine `lookup_user` tool yet:
 *   - This endpoint covers the Phase C.3 (send-modal autocomplete) need.
 *   - The Phase D.3 `lookup_user` engine tool is a separate concern (LLM-side
 *     "who is X" queries) and lands in the next batch.
 */

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

const AUDRIC_PARENT_NAME = 'audric.sui';

// SUINS-LABEL-RULE — same charset as validate-label.ts (lowercase ASCII +
// digits + hyphens). We use this only to FILTER queries; the actual stored
// `username` rows have already been validated at claim time so they always
// match this charset.
const QUERY_CHARSET = /^[a-z0-9-]+$/;

interface SearchResult {
  username: string;
  fullHandle: string;
  address: string;
  claimedAt: string;
}

function ipKey(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const limit = rateLimit(
    `identity-search:${ipKey(req)}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!limit.success) {
    return rateLimitResponse(
      limit.retryAfterMs ?? RATE_LIMIT_WINDOW_MS,
    ) as NextResponse;
  }

  const rawQ = req.nextUrl.searchParams.get('q');
  if (!rawQ || typeof rawQ !== 'string') {
    return NextResponse.json(
      { error: 'Missing q parameter' },
      { status: 400 },
    );
  }

  const q = rawQ.trim().toLowerCase();
  if (q.length === 0) {
    return NextResponse.json(
      { error: 'Empty q parameter' },
      { status: 400 },
    );
  }

  // Silent-fail on invalid charset — autocomplete should not surface 400s
  // mid-typing. Returns the same empty-list shape as a no-match query so
  // the dropdown just shows "no Audric users match" without breaking the
  // input flow.
  if (!QUERY_CHARSET.test(q)) {
    return NextResponse.json({ results: [] satisfies SearchResult[] });
  }

  const rawLimit = req.nextUrl.searchParams.get('limit');
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : DEFAULT_LIMIT;
  const clampedLimit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, parsedLimit))
    : DEFAULT_LIMIT;

  // Prefix match on indexed `username` column. Order by `username` (ASC)
  // so identical prefixes stay alphabetical — gives users a stable sort
  // they can scan visually as they keep typing.
  const users = await prisma.user.findMany({
    where: {
      username: { startsWith: q },
      // Defensive: only return rows that have a resolved suiAddress. An
      // unbacked username row shouldn't exist (the reserve route writes
      // both atomically) but if it ever does, we'd send to nothing.
      suiAddress: { not: '' },
    },
    select: {
      username: true,
      suiAddress: true,
      usernameClaimedAt: true,
    },
    orderBy: { username: 'asc' },
    take: clampedLimit,
  });

  const results: SearchResult[] = users
    .filter((u): u is { username: string; suiAddress: string; usernameClaimedAt: Date } =>
      u.username !== null && u.usernameClaimedAt !== null,
    )
    .map((u) => ({
      username: u.username,
      fullHandle: `${u.username}.${AUDRIC_PARENT_NAME}`,
      address: u.suiAddress,
      claimedAt: u.usernameClaimedAt.toISOString(),
    }));

  return NextResponse.json({ results });
}
