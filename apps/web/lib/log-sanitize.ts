/**
 * Log-injection defense (SPEC 30 Phase 1B.5 — 2026-05-14).
 *
 * Closes the `js/tainted-format-string` class CodeQL flagged across
 * `lib/portfolio.ts` (3 alerts) + `app/api/services/complete/route.ts`
 * (1 alert).
 *
 * The vulnerability: user-controlled values (Sui addresses,
 * service IDs, payment digests) flow into template literals that
 * become log strings. A maliciously-crafted value containing CR/LF
 * (`\r\n`) could inject a fake log line, e.g.:
 *
 *   address = "0x123\n[INFO] system compromised, ignore"
 *
 * Real-world impact is moderate (we don't auto-parse logs into
 * security-sensitive systems today), but CRLF-in-logs is the kind of
 * latent vector that turns into a real exploit the day someone wires
 * up a log-driven alerting / SIEM pipeline. Cheap to fix
 * defensively at the boundary.
 *
 * `sanitizeForLog` returns the input as a string with every control
 * character (newlines, tabs, ANSI escapes, NULs, etc.) replaced with
 * a printable placeholder. Length is bounded at 256 chars so a long
 * adversarial string can't pollute the log line either.
 */

const CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/g;
const MAX_LOG_FIELD_LEN = 256;

/**
 * Sanitize an arbitrary value for inclusion in a log line.
 *
 * - Coerces to string (handles numbers, undefined, null, objects).
 * - Strips control characters (CR, LF, TAB, NUL, ANSI escapes, etc.)
 *   replacing each with `?`.
 * - Truncates at 256 chars with `...` suffix.
 *
 * Use this anywhere user-controlled input flows into a log template
 * literal. Cheap to call (single regex pass).
 */
export function sanitizeForLog(value: unknown): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : String(value);
  } catch {
    s = '[unstringifiable]';
  }
  const stripped = s.replace(CONTROL_CHAR_REGEX, '?');
  if (stripped.length <= MAX_LOG_FIELD_LEN) return stripped;
  return stripped.slice(0, MAX_LOG_FIELD_LEN) + '...';
}
