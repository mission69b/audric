/**
 * Audric-side leaf-label validation for `username.audric.sui`.
 *
 * Two layers, in priority order:
 *   1. Audric UX cap — 3–20 chars (tighter than SuiNS protocol's 3–63, because
 *      handles render inline in chat / send modals; long ones wrap + break layout).
 *   2. SuiNS protocol rules — lowercase ASCII + digits + hyphens, no
 *      leading/trailing/consecutive hyphens.
 *
 * Duplicated from `@t2000/sdk`'s `validateLabel` ON PURPOSE: this file is
 * imported by client components, and importing the SDK there would drag Node-only
 * transitive deps into the client bundle. The SuiNS label rules are a protocol
 * invariant; if they ever change, update BOTH here and the SDK (greppable via
 * `// SUINS-LABEL-RULE`).
 */

const LABEL_MIN = 3;
const LABEL_MAX = 20;

// SUINS-LABEL-RULE — lowercase ASCII + digits + hyphens; no leading/trailing hyphen.
const SUINS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type LabelReason = "invalid" | "too-short" | "too-long";

export type LabelValidation =
  | { valid: true; label: string }
  | { valid: false; reason: LabelReason };

/** Validate + normalize (trim + lowercase) a candidate username. */
export function validateAudricLabel(raw: unknown): LabelValidation {
  if (typeof raw !== "string") {
    return { valid: false, reason: "invalid" };
  }
  const label = raw.trim().toLowerCase();

  if (label.length < LABEL_MIN) {
    return { valid: false, reason: "too-short" };
  }
  if (label.length > LABEL_MAX) {
    return { valid: false, reason: "too-long" };
  }
  // SUINS-LABEL-RULE — charset + leading/trailing hyphen
  if (!SUINS_LABEL_PATTERN.test(label)) {
    return { valid: false, reason: "invalid" };
  }
  // SUINS-LABEL-RULE — consecutive hyphens
  if (label.includes("--")) {
    return { valid: false, reason: "invalid" };
  }

  return { valid: true, label };
}
