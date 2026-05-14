/**
 * PII redaction for logs (SPEC 30 follow-up — 2026-05-14).
 *
 * Complements `lib/log-sanitize.ts` (which closes log-injection / CRLF):
 * `log-redact.ts` closes the *content* leak — wallet addresses, JWTs,
 * emails, and user IDs flowing into Vercel logs verbatim.
 *
 * Why this matters: Vercel log retention is multi-week, logs are
 * accessible to anyone with project access (operators, future hires,
 * support tooling). Address-by-address tracking inside logs lets a
 * future-bad-actor profile users without ever touching the database.
 * The on-chain history is public anyway, but joining "this address
 * was paid by Audric on these dates with these amounts" is private
 * data the database holds and the logs shouldn't replicate.
 *
 * Adoption is **incremental** — this module is the centralised tool
 * but call sites adopt as they're touched. Mass-rewriting 200+
 * `console.*` calls in one PR isn't surgical and won't survive churn;
 * adopting at the highest-traffic call sites (engine/chat,
 * lib/portfolio) gives 90% of the value at 10% of the diff. Future
 * call sites get reviewed via the runbook's 3-Read process.
 *
 * Threat model:
 *   - In scope: leakage of user-identifying values (addresses, JWTs,
 *     emails, internal user IDs) from operational logs.
 *   - Out of scope: redacting amounts (those are profile-revealing
 *     but already fuzzy without an address join), tx digests (those
 *     are fully public on-chain), and stack traces (handled by
 *     Vercel's existing scrubbers).
 */

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;
const TRUNCATED_ADDRESS = (addr: string): string =>
  // 8 leading + 4 trailing — enough to disambiguate in a multi-user log
  // tail without leaking the full identifier. Matches Sui block explorer
  // conventions (Suiscan / Suivision shorten the same way).
  `${addr.slice(0, 8)}…${addr.slice(-4)}`;

/**
 * Redact a Sui address for logging.
 *
 *   redactAddress('0x7f2059...c0ffee')  // → '0x7f2059…ffee'
 *   redactAddress('not-an-address')     // → '[invalid-address]'
 *   redactAddress(undefined)            // → '[no-address]'
 */
export function redactAddress(addr: unknown): string {
  if (typeof addr !== 'string') return '[no-address]';
  if (!ADDRESS_REGEX.test(addr)) {
    // Don't leak partial addresses that fail the format check —
    // they could be transcription errors, or PII in disguise.
    return '[invalid-address]';
  }
  return TRUNCATED_ADDRESS(addr);
}

/**
 * Redact a JWT for logging. Always returns the same fixed marker —
 * partial JWT prefixes are still enough to identify the issuer +
 * subject claims, so we never log any portion of the JWT itself.
 */
export function redactJwt(jwt: unknown): string {
  if (typeof jwt !== 'string' || jwt.length === 0) return '[no-jwt]';
  return '[jwt:redacted]';
}

/**
 * Redact an email for logging. Preserves the domain (operationally
 * useful — "are we seeing Workspace org issues?") and the first
 * character of the local-part so a multi-user collision in the same
 * domain stays disambiguatable.
 *
 *   redactEmail('alice@example.com')  // → 'a***@example.com'
 *   redactEmail('not-an-email')       // → '[invalid-email]'
 */
export function redactEmail(email: unknown): string {
  if (typeof email !== 'string') return '[no-email]';
  const at = email.indexOf('@');
  if (at <= 0 || at === email.length - 1) return '[invalid-email]';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return '[invalid-email]';
  const firstChar = local[0] ?? '';
  return `${firstChar}***@${domain}`;
}

const REDACT_KEY_SET = new Set<string>([
  // Wallet identifiers
  'address',
  'walletAddress',
  'suiAddress',
  'userAddress',
  'fromAddress',
  'toAddress',
  'recipientAddress',
  'senderAddress',
  // User identifiers
  'userId',
  'sub',
  // Auth tokens
  'jwt',
  'idToken',
  'accessToken',
  'refreshToken',
  'sessionToken',
  // Email
  'email',
  'userEmail',
]);

/**
 * Recursively redact PII from an object intended for logging.
 *
 * - Mutates a shallow clone, never the input (safe to pass live data).
 * - Walks one level into arrays + plain objects (depth-bounded to
 *   avoid pathological cycles in arbitrary log payloads).
 * - Non-string PII keys (e.g. numeric `userId`) are coerced to a
 *   stable redacted form via the typed redactors above.
 *
 *   redactPII({ address: '0x7f...ee', amount: 10, jwt: 'eyJ...' })
 *   // → { address: '0x7f2059…ffee', amount: 10, jwt: '[jwt:redacted]' }
 */
export function redactPII<T>(value: T, depth: number = 4): T {
  if (depth <= 0) return value;
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((v) => redactPII(v, depth - 1)) as unknown as T;
  }

  // Pass non-plain-object types through unchanged (Error, Date, Map,
  // Set, RegExp, Buffer, etc.). `Object.entries` returns [] for these
  // because their props are non-enumerable, so a naive recursive walk
  // would silently coerce them to `{}` and lose context. The whole
  // point of the redactor is to MAKE logs safer; losing an error
  // message in the process is a regression.
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEY_SET.has(key)) {
      if (key === 'jwt' || key === 'idToken' || key === 'accessToken' || key === 'refreshToken' || key === 'sessionToken') {
        out[key] = redactJwt(raw);
      } else if (key === 'email' || key === 'userEmail') {
        out[key] = redactEmail(raw);
      } else if (key === 'userId' || key === 'sub') {
        out[key] = typeof raw === 'string' && raw.length > 8
          ? `${raw.slice(0, 4)}…${raw.slice(-4)}`
          : '[redacted]';
      } else {
        out[key] = redactAddress(raw);
      }
    } else if (raw !== null && typeof raw === 'object') {
      out[key] = redactPII(raw, depth - 1);
    } else {
      out[key] = raw;
    }
  }
  return out as T;
}
