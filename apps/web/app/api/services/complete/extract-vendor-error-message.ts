/**
 * Sibling helper for the `services/complete` route handler.
 *
 * Lives in its OWN file (not `route.ts`) because Next.js 15 route modules
 * may only export the canonical Route exports (`GET`, `POST`, `PATCH`,
 * etc. — see `Lesson 1.0` in HANDOFF). Exporting a helper from `route.ts`
 * fails `next build` even though `tsc --noEmit` is silent. Sibling files
 * sit outside that constraint and stay freely importable from both the
 * route handler and the test.
 *
 * Pulls a human-readable error message out of a vendor error envelope.
 * Handles the three shapes seen in the wild:
 *   - `{ error: "string" }`               → MPP gateway, OpenAI 400 pre-charge etc.
 *   - `{ error: { message, code, type } }` → OpenAI ≥ 2024 standard error shape
 *   - `{ message: "string" }`             → some gateway fallthroughs
 *
 * Falls back to `JSON.stringify(error)` so the user at least sees structured
 * detail instead of "[object Object]" — that string is the symptom of the
 * 2026-05-13 P7 smoke prompt #5 failure that motivated this helper.
 */
export function extractVendorErrorMessage(result: unknown, fallback: string): string {
  if (!result || typeof result !== 'object') return fallback;
  const obj = result as Record<string, unknown>;

  const err = obj.error;
  if (typeof err === 'string' && err.trim().length > 0) return err;
  if (err && typeof err === 'object') {
    const inner = err as Record<string, unknown>;
    if (typeof inner.message === 'string' && inner.message.trim().length > 0) return inner.message;
    try {
      return JSON.stringify(err);
    } catch {
      return fallback;
    }
  }

  if (typeof obj.message === 'string' && obj.message.trim().length > 0) return obj.message;

  return fallback;
}
