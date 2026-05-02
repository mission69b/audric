/**
 * SPEC 7 P2.4b — User-facing copy for regenerate failure modes.
 *
 * Maps the engine's `RegenerateFailure.reason` codes to short toast
 * strings. Kept in one file so a copy review (or i18n pass) only
 * touches one location.
 */
import type { RegenerateFailure } from '@t2000/engine';

export const REGEN_ERROR_COPY: Record<RegenerateFailure['reason'], string> = {
  pending_action_not_found:
    'This card is no longer active. Re-prompt to start over.',
  cannot_regenerate:
    'Nothing to refresh on this card.',
  engine_error:
    'Could not refresh the quote. The original card is still valid.',
};
