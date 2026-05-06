/**
 * SPEC 10 D.4 — small helpers for detecting Audric handles in SuiNS reverse-
 * lookup results.
 *
 * `resolveAddressToSuinsViaRpc(address)` returns `string[]` — every SuiNS
 * name registered to that address. We can't just take `result[0]` because
 * the registry may contain a generic `.sui` name (e.g. `alex.sui`) that's
 * not an Audric handle, OR the parent `audric.sui` itself (won't happen
 * for normal users but defensive).
 *
 * The "Audric handle" predicate: ends with `.audric.sui` AND isn't the
 * parent name `audric.sui` itself. Audric leaves are claimed under that
 * exact parent in `packages/sdk/src/protocols/suins-leaf.ts`.
 *
 * Pre-this-helper, `app/api/engine/resume-with-input/route-helpers.ts`
 * picked `reverse[0]` blindly as the audricUsername — that's wrong if the
 * registry's first name is e.g. `alex.sui`. The buglet is fixed in the
 * D.4 commit by routing through `pickAudricHandleFromReverseNames`.
 */

const AUDRIC_PARENT_NAME = 'audric.sui';
const AUDRIC_LEAF_SUFFIX = `.${AUDRIC_PARENT_NAME}`;

/**
 * True if `name` is a leaf subname under `audric.sui` (e.g. `alice.audric.sui`).
 * Returns false for the parent name itself and for any non-Audric SuiNS.
 */
export function isAudricHandle(name: string): boolean {
  if (name === AUDRIC_PARENT_NAME) return false;
  return name.endsWith(AUDRIC_LEAF_SUFFIX);
}

/**
 * Pick the first Audric leaf handle from a reverse-SuiNS result. Returns
 * null if no Audric leaf is registered to the address (the address may
 * still have other SuiNS names — those are intentionally ignored here).
 *
 * If the registry returns multiple Audric leaves for the same address
 * (rare; only happens if a user claims, releases, then re-claims under
 * a different label) we take the first — `resolveAddressToSuinsViaRpc`
 * orders by registration recency.
 */
export function pickAudricHandleFromReverseNames(names: string[]): string | null {
  for (const name of names) {
    if (isAudricHandle(name)) return name;
  }
  return null;
}
