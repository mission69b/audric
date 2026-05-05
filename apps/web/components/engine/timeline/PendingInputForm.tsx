'use client';

import { useState, useMemo, useCallback } from 'react';
import type { FormSchema, FormField } from '@/lib/engine/sse-types';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 9 v0.1.3 P9.4 — PendingInputForm
//
// Renders a typed inline form for a `pending_input` SSE event. The field
// renderer is a closed switch keyed on `FormFieldKind`:
//
//   text / sui-recipient → <input type="text">
//   number / usd         → <input type="number"> (usd shows $ prefix)
//   select               → <select>
//   date                 → <input type="date">
//
// Why one component (not per-kind subcomponents):
//   The form has 1–2 fields in v0.1.3 (the only consumer is `add_recipient`,
//   2 fields). Splitting into 6 components for 2 callsites is over-engineered.
//   When v0.2 adds a multi-step or wizard form, we'll extract the field
//   renderers; for now the inline switch is the simplest source of truth.
//
// Resolution boundary:
//   The `sui-recipient` kind is rendered as a plain text input. Polymorphic
//   resolution (Audric handle / SuiNS / 0x → canonical 0x address +
//   `audricUsername`) happens server-side in
//   `/api/engine/resume-with-input`, NOT here. Two reasons:
//     1. Resolution requires `normalizeAddressInput` + an RPC round-trip
//        we don't want to ship to the client (no API key in browser).
//     2. The host's resume route is the one source of truth for the
//        Contact persistence shape (SPEC 10 D7); the form just hands
//        over a raw string.
// ───────────────────────────────────────────────────────────────────────────

export type PendingInputFormStatus = 'pending' | 'submitting' | 'submitted' | 'error';

export interface PendingInputFormProps {
  /** Form schema from the engine's `pending_input` event. */
  schema: FormSchema;
  /** Optional caption rendered above the form. */
  description?: string;
  /** Local UX state — drives disable/spinner/collapsed states. */
  status: PendingInputFormStatus;
  /** Inline error text rendered when `status === 'error'`. */
  errorMessage?: string;
  /**
   * Captured submitted values for the `submitted` collapsed row. Required
   * when `status === 'submitted'`; ignored otherwise.
   */
  submittedValues?: Record<string, unknown>;
  /**
   * Called with the raw form values (before server-side resolution) when
   * the user clicks Submit. The parent persists `status='submitting'`,
   * POSTs to the resume endpoint, then transitions to `submitted` /
   * `error` based on the response.
   */
  onSubmit: (values: Record<string, unknown>) => void;
}

export function PendingInputForm({
  schema,
  description,
  status,
  errorMessage,
  submittedValues,
  onSubmit,
}: PendingInputFormProps) {
  // [Local form state] One entry per field, keyed on `field.name`. Default
  // values are empty strings — number / usd kinds parse on submit so the
  // intermediate state is always a string (matches <input> behaviour).
  const initialValues = useMemo(() => {
    const v: Record<string, string> = {};
    for (const f of schema.fields) v[f.name] = '';
    return v;
  }, [schema.fields]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);

  // [Per-field validation errors] Cleared when the user edits the field.
  // Submit pre-flights these client-side; the server still runs its own
  // validation (defense-in-depth).
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleFieldChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // [Client-side validation] Required + numeric parsing. Server runs
      // its own pass (Zod) so this is just for snappy UX feedback.
      const errors: Record<string, string> = {};
      const parsed: Record<string, unknown> = {};
      for (const field of schema.fields) {
        const raw = values[field.name] ?? '';
        if (field.required && raw.trim() === '') {
          errors[field.name] = 'Required';
          continue;
        }
        if ((field.kind === 'number' || field.kind === 'usd') && raw !== '') {
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            errors[field.name] = 'Must be a number';
            continue;
          }
          parsed[field.name] = n;
        } else if (raw !== '') {
          parsed[field.name] = raw.trim();
        }
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      onSubmit(parsed);
    },
    [schema.fields, values, onSubmit],
  );

  // [Collapsed row] Once the resume call succeeds the form collapses to
  // a one-line summary so the next assistant message stays the focal
  // point. Format: "Submitted: <field-1-label> = <value>; <field-2> = ..."
  if (status === 'submitted' && submittedValues) {
    const summary = schema.fields
      .map((f) => `${f.label}: ${formatSubmittedValue(submittedValues[f.name], f)}`)
      .filter(Boolean)
      .join(' · ');
    return (
      <div
        data-testid="pending-input-submitted"
        className="rounded-md border border-border-subtle bg-surface-page/40 px-3 py-2 text-[12px] text-fg-secondary"
      >
        <span className="font-medium text-fg-primary">Submitted</span>
        {summary && <> · {summary}</>}
      </div>
    );
  }

  const isSubmitting = status === 'submitting';
  const isError = status === 'error';

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="pending-input-form"
      className="space-y-3 rounded-md border border-border-subtle bg-surface-page/40 px-3 py-3"
    >
      {description && (
        <div className="text-[11px] font-medium uppercase tracking-wide text-fg-secondary">
          {description}
        </div>
      )}

      <div className="space-y-2.5">
        {schema.fields.map((field) => (
          <FormFieldRow
            key={field.name}
            field={field}
            value={values[field.name] ?? ''}
            onChange={(v) => handleFieldChange(field.name, v)}
            disabled={isSubmitting}
            error={fieldErrors[field.name]}
          />
        ))}
      </div>

      {isError && errorMessage && (
        <div
          data-testid="pending-input-error"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-400"
        >
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="pending-input-submit"
          className="inline-flex items-center justify-center rounded-md border border-border-strong bg-fg-primary px-3 py-1.5 text-[12px] font-medium text-bg-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Submit'}
        </button>
      </div>
    </form>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Per-row renderer — single switch keyed on `field.kind`.
// ───────────────────────────────────────────────────────────────────────────

interface FormFieldRowProps {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  error?: string;
}

function FormFieldRow({ field, value, onChange, disabled, error }: FormFieldRowProps) {
  const inputId = `pending-input-${field.name}`;
  // [P9.4 host a11y] Wire aria-describedby to the error/help message so
  // screen readers announce them when the input is focused. Mark the
  // asterisk aria-hidden — required state is already conveyed by
  // aria-required on the input.
  const describedById = error
    ? `${inputId}-error`
    : field.helpText
      ? `${inputId}-help`
      : undefined;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-fg-secondary">
        {field.label}
        {field.required && (
          <span aria-hidden="true" className="ml-1 text-red-400">
            *
          </span>
        )}
      </span>
      <FormFieldInput
        id={inputId}
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={!!field.required}
        invalid={!!error}
        describedBy={describedById}
      />
      {error && (
        <span
          id={`${inputId}-error`}
          role="alert"
          data-testid={`pending-input-field-error-${field.name}`}
          className="text-[11px] text-red-400"
        >
          {error}
        </span>
      )}
      {field.helpText && !error && (
        <span id={`${inputId}-help`} className="text-[11px] text-fg-tertiary">
          {field.helpText}
        </span>
      )}
    </label>
  );
}

interface FormFieldInputProps {
  id: string;
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  required: boolean;
  invalid: boolean;
  describedBy?: string;
}

function FormFieldInput({
  id,
  field,
  value,
  onChange,
  disabled,
  required,
  invalid,
  describedBy,
}: FormFieldInputProps) {
  // [Closed switch — adding a new FormFieldKind requires updating this AND
  // the engine's FormFieldKind union. TS will fail compile if a new
  // member is added to the union without a case here.]
  const baseClass =
    'w-full rounded-md border border-border-subtle bg-surface-page px-2.5 py-1.5 text-sm text-fg-primary focus:border-border-strong focus:outline-none disabled:opacity-50';

  switch (field.kind) {
    case 'select':
      return (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={baseClass}
        >
          <option value="" disabled>
            {field.placeholder ?? 'Select…'}
          </option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'date':
      return (
        <input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${baseClass} font-mono`}
        />
      );

    case 'number':
      return (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${baseClass} font-mono`}
        />
      );

    case 'usd':
      return (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-fg-secondary"
          >
            $
          </span>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? '0.00'}
            disabled={disabled}
            aria-required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={`${baseClass} pl-6 font-mono`}
          />
        </div>
      );

    case 'sui-recipient':
      return (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? '@alice  /  alex.sui  /  0x40cd…3e62'}
          disabled={disabled}
          aria-required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          // monospace because addresses + handles have alignment/typo cost
          className={`${baseClass} font-mono`}
          autoComplete="off"
          spellCheck={false}
        />
      );

    case 'text':
    default:
      return (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={baseClass}
          autoComplete="off"
        />
      );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Display helper — formats the post-submit collapsed-row value per kind.
// ───────────────────────────────────────────────────────────────────────────

function formatSubmittedValue(value: unknown, field: FormField): string {
  if (value == null || value === '') return '—';
  if (field.kind === 'usd' && typeof value === 'number') {
    return `$${value.toFixed(2)}`;
  }
  if (field.kind === 'select' && typeof value === 'string') {
    const opt = field.options?.find((o) => o.value === value);
    return opt?.label ?? value;
  }
  return String(value);
}
