import { z } from 'zod';
import { buildTool } from '@t2000/engine';
import { prisma } from '@/lib/prisma';
import { validateAudricLabel } from '@/lib/identity/validate-label';
import { isReserved } from '@/lib/identity/reserved-usernames';

/**
 * SPEC 10 D.3 — `lookup_user` engine tool.
 *
 * Why audric-side, not engine-side: the lookup queries the audric
 * `User` Prisma table (`username` + `suiAddress` + `usernameClaimedAt`).
 * The engine package can't and shouldn't depend on the audric DB —
 * pluggable hooks would just shuffle the dependency around. This is the
 * same pattern as `record_advice` (`advice-tool.ts`) and the audric
 * contact tools (`contact-tools.ts`): tool definition lives where its
 * data lives, registered into the engine via `engine-factory.ts`'s
 * tool list spread.
 *
 * Why distinct from `resolve_suins` (engine-side):
 *   - `resolve_suins` is the generic SuiNS lookup primitive — works
 *     for ANY `.sui` name (e.g. `alex.sui`, `team.alex.sui`) and
 *     returns the registered 0x address (forward) or names list
 *     (reverse).
 *   - `lookup_user` is specifically about Audric users — accepts
 *     `@alice` / `alice.audric.sui` / bare `alice` / 0x address,
 *     returns Audric-specific metadata (`username`, `claimedAt`,
 *     `profileUrl`). It does NOT do generic SuiNS resolution.
 *
 * The two tools coexist intentionally — same way `balance_check` and
 * `portfolio_analysis` coexist (one lightweight, one rich). The LLM
 * picks based on the user's intent:
 *   - "what's the address of alex.sui"      → resolve_suins
 *   - "who is @alice" / "who is alice"       → lookup_user
 *   - "what's the SuiNS for 0xabc..."        → resolve_suins (reverse)
 *   - "is this an Audric user?"              → lookup_user (forward or reverse)
 *
 * Input forms accepted (all normalized to a Prisma query):
 *   - `@alice`                  → strip @, look up by `username = 'alice'`
 *   - `alice`                   → look up by `username = 'alice'`
 *   - `alice.audric.sui`        → strip `.audric.sui`, look up by `username = 'alice'`
 *   - `0x...64hex`              → look up by `suiAddress = '0x...'`
 *
 * Forms intentionally REJECTED with `not-audric-suins` reason:
 *   - `alex.sui` (top-level SuiNS, not an Audric subname)
 *   - `team.alex.sui` (third-party leaf, not under audric.sui)
 *   The LLM is told to call `resolve_suins` for those.
 *
 * Privacy note: the User table is the same data exposed by
 * `/api/identity/search` (the C.3 autocomplete endpoint) and by
 * SuiNS reverse-resolution on-chain. Surfacing it here doesn't
 * leak anything that isn't already publicly resolvable.
 */

const AUDRIC_PARENT_SUFFIX = '.audric.sui';
const SUI_ADDRESS_REGEX = /^0x[a-f0-9]{64}$/;
const PROFILE_BASE_URL = 'https://audric.ai';

type LookupReason =
  | 'no-such-user'
  | 'invalid-label'
  | 'reserved-label'
  | 'not-audric-suins'
  | 'invalid-address';

interface LookupUserHit {
  found: true;
  query: string;
  username: string;
  fullHandle: string;
  address: string;
  claimedAt: string;
  isAudricUser: true;
  profileUrl: string;
}

interface LookupUserMiss {
  found: false;
  query: string;
  reason: LookupReason;
  hint?: string;
}

type LookupUserResult = LookupUserHit | LookupUserMiss;

// ---------------------------------------------------------------------------
// Input → (label | address) normalisation
// ---------------------------------------------------------------------------

interface NormalisedQuery {
  kind: 'label' | 'address';
  value: string;
}

interface NormaliseError {
  reason: LookupReason;
  hint?: string;
}

function normaliseQuery(raw: string): NormalisedQuery | NormaliseError {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { reason: 'invalid-label', hint: 'empty query' };
  }

  if (trimmed.toLowerCase().startsWith('0x')) {
    const lower = trimmed.toLowerCase();
    if (!SUI_ADDRESS_REGEX.test(lower)) {
      return {
        reason: 'invalid-address',
        hint: 'address must be 0x followed by 64 hex chars',
      };
    }
    return { kind: 'address', value: lower };
  }

  let candidate = trimmed.toLowerCase();
  if (candidate.startsWith('@')) candidate = candidate.slice(1);

  if (candidate.endsWith('.sui') && !candidate.endsWith(AUDRIC_PARENT_SUFFIX)) {
    return {
      reason: 'not-audric-suins',
      hint:
        `"${trimmed}" is a SuiNS name but not an Audric handle. ` +
        `Call resolve_suins for generic SuiNS lookups.`,
    };
  }

  if (candidate.endsWith(AUDRIC_PARENT_SUFFIX)) {
    candidate = candidate.slice(0, -AUDRIC_PARENT_SUFFIX.length);
  }

  const validation = validateAudricLabel(candidate);
  if (!validation.valid) {
    return {
      reason: 'invalid-label',
      hint:
        validation.reason === 'too-short'
          ? 'label must be at least 3 characters'
          : validation.reason === 'too-long'
            ? 'label must be at most 20 characters'
            : 'label has invalid characters (allowed: a-z 0-9 hyphen)',
    };
  }

  if (isReserved(validation.label)) {
    return {
      reason: 'reserved-label',
      hint: `"${validation.label}" is reserved and cannot be claimed by users`,
    };
  }

  return { kind: 'label', value: validation.label };
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const InputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'An Audric user identifier in any of these forms: ' +
        '"@alice" / "alice" / "alice.audric.sui" / a 0x address. ' +
        'For top-level SuiNS names (e.g. "alex.sui"), use resolve_suins instead.',
    ),
});

export const lookupUserTool = buildTool({
  name: 'lookup_user',
  description:
    'Look up a registered Audric user by handle or address. Returns the ' +
    "user's Audric username, full `username.audric.sui` handle, 0x wallet address, " +
    'claim date, and `audric.ai/{username}` profile URL. ' +
    '\n\nUse this WHENEVER the user asks "who is X", "do you know @alice", ' +
    '"is this person on Audric", or wants to check if a handle / address belongs ' +
    'to an Audric user. Accepts: `@alice`, bare `alice`, full `alice.audric.sui`, ' +
    'or a 0x address (reverse lookup). ' +
    '\n\nReturns `{ found: true, username, fullHandle, address, claimedAt, profileUrl }` ' +
    'on a hit, or `{ found: false, reason }` on a miss. ' +
    '\n\nWhen narrating a hit, ALWAYS use the full `username.audric.sui` form (D10 narration ' +
    'rule). When narrating a miss, you can suggest searching SuiNS via `resolve_suins` if the ' +
    'user passed a generic `.sui` name (the tool tells you when this is the case via ' +
    '`reason: "not-audric-suins"`). ' +
    '\n\nThis tool only knows about Audric users — for generic SuiNS lookups (e.g. `alex.sui`, ' +
    '`team.alex.sui`) call `resolve_suins` instead.',
  inputSchema: InputSchema,
  jsonSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        description:
          'An Audric user identifier (@alice / alice / alice.audric.sui / 0x address).',
      },
    },
  },
  isReadOnly: true,
  cacheable: true,
  preflight: (input) => {
    const trimmed = (input.query ?? '').trim();
    if (!trimmed) return { valid: false, error: 'query is required' };
    return { valid: true };
  },
  async call(input): Promise<{ data: LookupUserResult; displayText: string }> {
    const original = input.query.trim();
    const normalised = normaliseQuery(original);

    if ('reason' in normalised) {
      const miss: LookupUserMiss = {
        found: false,
        query: original,
        reason: normalised.reason,
        ...(normalised.hint ? { hint: normalised.hint } : {}),
      };
      return {
        data: miss,
        displayText:
          normalised.reason === 'not-audric-suins'
            ? `${original} is a SuiNS name but not an Audric handle.`
            : `Couldn't look up "${original}": ${normalised.hint ?? normalised.reason}.`,
      };
    }

    const where =
      normalised.kind === 'label'
        ? { username: normalised.value }
        : { suiAddress: normalised.value };

    const user = await prisma.user.findFirst({
      where,
      select: {
        username: true,
        suiAddress: true,
        usernameClaimedAt: true,
      },
    });

    if (
      !user ||
      user.username === null ||
      user.usernameClaimedAt === null ||
      !user.suiAddress
    ) {
      const miss: LookupUserMiss = {
        found: false,
        query: original,
        reason: 'no-such-user',
        ...(normalised.kind === 'address'
          ? { hint: 'no Audric user has claimed this address as their wallet' }
          : { hint: `no Audric user with handle "${normalised.value}.audric.sui"` }),
      };
      return {
        data: miss,
        displayText:
          normalised.kind === 'address'
            ? `\`${normalised.value.slice(0, 10)}…${normalised.value.slice(-6)}\` isn't an Audric user.`
            : `${normalised.value}.audric.sui isn't a registered Audric handle.`,
      };
    }

    const hit: LookupUserHit = {
      found: true,
      query: original,
      username: user.username,
      fullHandle: `${user.username}.audric.sui`,
      address: user.suiAddress,
      claimedAt: user.usernameClaimedAt.toISOString(),
      isAudricUser: true,
      profileUrl: `${PROFILE_BASE_URL}/${user.username}`,
    };

    return {
      data: hit,
      displayText: `${hit.fullHandle} → \`${hit.address.slice(0, 10)}…${hit.address.slice(-6)}\``,
    };
  },
});
