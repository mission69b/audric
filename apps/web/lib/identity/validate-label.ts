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
 *      leading/trailing/consecutive hyphens. **Delegated to `validateLabel`
 *      from `@t2000/sdk`** (since v1.22.0 / SPEC 10 Phase B.2). Single
 *      source of truth lives in `packages/sdk/src/protocols/suins-leaf.ts`;
 *      this file used to inline the regex while waiting for the SDK
 *      release, but that duplication is now removed.
 *
 * Returns one of the SPEC 10 D3-defined `reason` codes that the
 * `/api/identity/check` route surfaces verbatim. Order matters — length
 * is checked before charset so users typing slowly see "too short"
 * progressively rather than "invalid" the moment they type a hyphen.
 */

import { validateLabel as validateSuinsLabel } from '@t2000/sdk';

const LABEL_MIN = 3;
const LABEL_MAX = 20;

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

  const protocolCheck = validateSuinsLabel(label);
  if (!protocolCheck.valid) {
    return { valid: false, reason: 'invalid' };
  }

  return { valid: true, label };
}
