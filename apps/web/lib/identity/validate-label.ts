/**
 * Audric-side leaf-label validation for `username.audric.sui`.
 *
 * Two layers of rules are checked here, in priority order:
 *
 *   1. Audric UX cap — length 3–20 chars (per SPEC 10 D3). Tighter than the
 *      SuiNS protocol's 3–63 cap because handles render inline in chat,
 *      contact lists, and the send modal — long handles wrap and break
 *      layout. The cap is a host-side product decision, not a protocol
 *      constraint, so it lives in audric not the SDK.
 *
 *   2. SuiNS protocol rules — lowercase ASCII + digits + hyphens, no
 *      leading/trailing/consecutive hyphens.
 *
 * Returns one of the SPEC 10 D3-defined `reason` codes that the
 * `/api/identity/check` route surfaces verbatim. Order matters — length
 * is checked before charset so users typing slowly see "too short"
 * progressively rather than "invalid" the moment they type a hyphen.
 *
 * **Why we DUPLICATE the SuiNS rules instead of importing from `@t2000/sdk`**
 *
 * This file is imported by `<UsernamePicker>` (a `'use client'` component).
 * If we delegated to `validateLabel` from `@t2000/sdk`, webpack would try
 * to bundle the SDK's transitive deps (notably `@pythnetwork/pyth-sui-js`,
 * which uses `node:buffer` + `fs` + `fs/promises`) into the client bundle
 * — and fail with `UnhandledSchemeError: Reading from "node:buffer" is
 * not handled by plugins` (CI failure surfaced after S.72 wired the picker
 * into `/new/page.tsx`, making the import chain client-reachable for the
 * first time).
 *
 * The SuiNS label rules are a SuiNS protocol invariant (lowercase ASCII +
 * digits + hyphens, 3–63 length, no leading/trailing/consecutive hyphens) —
 * they don't drift. Duplicating ~5 LOC of regex + hyphen checks here is
 * the cheapest fix; the SDK's `validateLabel` stays canonical for SDK
 * consumers (CLI, MCP server, future host integrations that don't have
 * the same client-bundle constraints).
 *
 * If the SuiNS protocol ever changes its label rules, BOTH this file and
 * `packages/sdk/src/protocols/suins-leaf.ts` need updating. Mark them with
 * a paired `// SUINS-LABEL-RULE` comment to make the duplication greppable.
 */

const LABEL_MIN = 3;
const LABEL_MAX = 20;

// SUINS-LABEL-RULE — see also packages/sdk/src/protocols/suins-leaf.ts
// Lowercase ASCII letters + digits + hyphens. Hyphens cannot lead/trail.
const SUINS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type LabelReason = 'invalid' | 'too-short' | 'too-long';

export type LabelValidation =
  | { valid: true; label: string }
  | { valid: false; reason: LabelReason };

/**
 * Validate + normalize a candidate username. Trims and lowercases the
 * input; rejects with a structured reason if any rule fails. The returned
 * `label` (on the success path) is the canonical form to be used in
 * downstream checks (reserved-list, DB unique, SuiNS RPC).
 */
export function validateAudricLabel(raw: unknown): LabelValidation {
  if (typeof raw !== 'string') {
    return { valid: false, reason: 'invalid' };
  }
  const label = raw.trim().toLowerCase();

  if (label.length < LABEL_MIN) return { valid: false, reason: 'too-short' };
  if (label.length > LABEL_MAX) return { valid: false, reason: 'too-long' };

  // SUINS-LABEL-RULE — charset + leading/trailing hyphen
  if (!SUINS_LABEL_PATTERN.test(label)) {
    return { valid: false, reason: 'invalid' };
  }
  // SUINS-LABEL-RULE — consecutive hyphens
  if (label.includes('--')) {
    return { valid: false, reason: 'invalid' };
  }

  return { valid: true, label };
}
