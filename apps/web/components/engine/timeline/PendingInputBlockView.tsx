'use client';

import { useCallback } from 'react';
import type { PendingInputTimelineBlock } from '@/lib/engine-types';
import { PendingInputForm } from './PendingInputForm';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 9 v0.1.3 P9.4 — PendingInputBlockView
//
// Hosts the inline form for a `pending_input` SSE event. Lifecycle:
//
//   1. Engine emits `pending_input` → reducer appends a `pending-input`
//      block in `status: 'pending'`.
//   2. User fills + submits → parent transitions to `status: 'submitting'`,
//      POSTs to `/api/engine/resume-with-input`.
//   3a. On 2xx → parent transitions to `status: 'submitted'`, the SSE stream
//      from the resume endpoint extends the SAME timeline (the resumed
//      tool_result arrives as a new tool block; the LLM narrates after).
//   3b. On error → parent transitions to `status: 'error'` with an
//      `errorMessage`, form re-shows so user can re-submit.
//
// Why we render even when `status !== 'pending'`:
//   `'submitting'` shows the disabled/spinner state (form stays mounted).
//   `'submitted'` shows the collapsed confirmation row (single line).
//   `'error'` shows the form again with an inline error.
//   Only `'pending'` mounts the editable form for the first time.
// ───────────────────────────────────────────────────────────────────────────

interface PendingInputBlockViewProps {
  block: PendingInputTimelineBlock;
  /**
   * Parent supplies the submit handler. Typical implementation:
   *   1. Set block.status = 'submitting' (optimistic).
   *   2. POST /api/engine/resume-with-input with { inputId, values }.
   *   3. On 2xx, set status = 'submitted' + capture submittedValues, then
   *      stream the resumed-turn SSE response into the same timeline.
   *   4. On 4xx/5xx, set status = 'error' + errorMessage.
   */
  onSubmit: (inputId: string, values: Record<string, unknown>) => void;
}

export function PendingInputBlockView({ block, onSubmit }: PendingInputBlockViewProps) {
  const handleSubmit = useCallback(
    (values: Record<string, unknown>) => {
      onSubmit(block.inputId, values);
    },
    [block.inputId, onSubmit],
  );

  return (
    <PendingInputForm
      schema={block.schema}
      description={block.description}
      status={block.status}
      errorMessage={block.errorMessage}
      submittedValues={block.submittedValues}
      onSubmit={handleSubmit}
    />
  );
}
