// ───────────────────────────────────────────────────────────────────────────
// SPEC 9 v0.1.3 P9.4 — PendingInputBlockView + PendingInputForm tests
//
// Covers:
//   1. Renderer mounts the form for `status: 'pending'`.
//   2. Each FormFieldKind renders the right input variant.
//   3. Required-field client validation blocks submit.
//   4. Number / USD coercion on submit (string → Number).
//   5. Submitting state disables the inputs + button.
//   6. Submitted state collapses to the confirmation row.
//   7. Error state shows the error banner + leaves form editable.
//   8. The submit handler is invoked with the form values verbatim.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, within } from '@testing-library/react';
import { PendingInputBlockView } from '../PendingInputBlockView';
import { PendingInputForm } from '../PendingInputForm';
import type { PendingInputTimelineBlock } from '@/lib/engine-types';
import type { FormSchema } from '@/lib/engine/sse-types';

const ADD_RECIPIENT_SCHEMA: FormSchema = {
  fields: [
    {
      name: 'name',
      label: 'Nickname',
      kind: 'text',
      required: true,
      placeholder: 'Mom',
    },
    {
      name: 'identifier',
      label: 'Audric handle, SuiNS, or 0x',
      kind: 'sui-recipient',
      required: true,
      helpText: 'Type @alice for an Audric user, alex.sui for any SuiNS, or paste a 0x address.',
    },
  ],
};

function makeBlock(
  partial: Partial<PendingInputTimelineBlock> = {},
): PendingInputTimelineBlock {
  return {
    type: 'pending-input',
    inputId: 'in-1',
    toolName: 'add_recipient',
    toolUseId: 'tc-1',
    schema: ADD_RECIPIENT_SCHEMA,
    description: 'Add a new contact',
    status: 'pending',
    assistantContent: [],
    completedResults: [],
    ...partial,
  };
}

describe('PendingInputBlockView — render lifecycle', () => {
  it('mounts the form when status === "pending"', () => {
    const onSubmit = vi.fn();
    render(<PendingInputBlockView block={makeBlock()} onSubmit={onSubmit} />);
    expect(screen.getByTestId('pending-input-form')).toBeDefined();
    expect(screen.getByText('Add a new contact')).toBeDefined();
  });

  it('shows the spinner caption + disabled button when status === "submitting"', () => {
    render(
      <PendingInputBlockView
        block={makeBlock({ status: 'submitting' })}
        onSubmit={vi.fn()}
      />,
    );
    const submitButton = screen.getByTestId('pending-input-submit') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toMatch(/saving/i);
  });

  it('collapses to the submitted confirmation row when status === "submitted"', () => {
    render(
      <PendingInputBlockView
        block={makeBlock({
          status: 'submitted',
          submittedValues: { name: 'Mom', identifier: 'mom.audric.sui' },
        })}
        onSubmit={vi.fn()}
      />,
    );
    const submitted = screen.getByTestId('pending-input-submitted');
    expect(submitted.textContent).toMatch(/Submitted/);
    expect(submitted.textContent).toMatch(/Mom/);
    expect(submitted.textContent).toMatch(/mom\.audric\.sui/);
    // Form should NOT also be rendered.
    expect(screen.queryByTestId('pending-input-form')).toBeNull();
  });

  it('re-shows the form with an inline error banner when status === "error"', () => {
    render(
      <PendingInputBlockView
        block={makeBlock({
          status: 'error',
          errorMessage: 'Could not resolve recipient',
        })}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pending-input-form')).toBeDefined();
    expect(screen.getByTestId('pending-input-error').textContent).toMatch(
      /Could not resolve recipient/,
    );
  });
});

describe('PendingInputForm — field-kind rendering', () => {
  function setup(schema: FormSchema, status: 'pending' | 'submitting' | 'error' = 'pending') {
    const onSubmit = vi.fn();
    const utils = render(
      <PendingInputForm schema={schema} status={status} onSubmit={onSubmit} />,
    );
    return { onSubmit, ...utils };
  }

  it('renders a <input type="text"> for kind: text', () => {
    setup({ fields: [{ name: 'a', label: 'A', kind: 'text', required: false }] });
    const input = screen.getByLabelText(/A/) as HTMLInputElement;
    expect(input.type).toBe('text');
  });

  it('renders a monospace text input for kind: sui-recipient', () => {
    setup({
      fields: [{ name: 'r', label: 'R', kind: 'sui-recipient', required: false }],
    });
    const input = screen.getByLabelText(/R/) as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.className).toMatch(/font-mono/);
  });

  it('renders a <input type="number"> for kind: number', () => {
    setup({ fields: [{ name: 'n', label: 'N', kind: 'number', required: false }] });
    const input = screen.getByLabelText(/N/) as HTMLInputElement;
    expect(input.type).toBe('number');
  });

  it('renders a $-prefixed numeric input for kind: usd', () => {
    setup({ fields: [{ name: 'u', label: 'U', kind: 'usd', required: false }] });
    const input = screen.getByLabelText(/U/) as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.step).toBe('0.01');
    // The dollar prefix lives in a sibling span.
    const wrapper = input.parentElement!;
    expect(within(wrapper).getByText('$')).toBeDefined();
  });

  it('renders a <select> with options for kind: select', () => {
    setup({
      fields: [
        {
          name: 's',
          label: 'S',
          kind: 'select',
          required: false,
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
          ],
        },
      ],
    });
    const select = screen.getByLabelText(/S/) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    const labels = Array.from(select.options).map((o) => o.label);
    expect(labels).toContain('Alpha');
    expect(labels).toContain('Beta');
  });

  it('renders a <input type="date"> for kind: date', () => {
    setup({ fields: [{ name: 'd', label: 'D', kind: 'date', required: false }] });
    const input = screen.getByLabelText(/D/) as HTMLInputElement;
    expect(input.type).toBe('date');
  });
});

describe('PendingInputForm — submit lifecycle', () => {
  it('blocks submit + flags required fields when empty', () => {
    const onSubmit = vi.fn();
    render(<PendingInputForm schema={ADD_RECIPIENT_SCHEMA} status="pending" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('pending-input-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('pending-input-field-error-name').textContent).toMatch(/required/i);
    expect(
      screen.getByTestId('pending-input-field-error-identifier').textContent,
    ).toMatch(/required/i);
  });

  it('invokes onSubmit with the typed values when filled', () => {
    const onSubmit = vi.fn();
    render(<PendingInputForm schema={ADD_RECIPIENT_SCHEMA} status="pending" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Nickname/), { target: { value: 'Mom' } });
    fireEvent.change(screen.getByLabelText(/Audric handle, SuiNS, or 0x/), {
      target: { value: 'mom.audric.sui' },
    });
    fireEvent.click(screen.getByTestId('pending-input-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Mom',
      identifier: 'mom.audric.sui',
    });
  });

  it('coerces number / usd field values to JS numbers on submit', () => {
    const onSubmit = vi.fn();
    render(
      <PendingInputForm
        schema={{
          fields: [
            { name: 'qty', label: 'Quantity', kind: 'number', required: true },
            { name: 'amt', label: 'Amount', kind: 'usd', required: true },
          ],
        }}
        status="pending"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '12.50' } });
    fireEvent.click(screen.getByTestId('pending-input-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ qty: 7, amt: 12.5 });
  });

  it('clears a field-level error when the user starts typing in that field', () => {
    const onSubmit = vi.fn();
    render(<PendingInputForm schema={ADD_RECIPIENT_SCHEMA} status="pending" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('pending-input-submit'));
    expect(screen.getByTestId('pending-input-field-error-name')).toBeDefined();
    fireEvent.change(screen.getByLabelText(/Nickname/), { target: { value: 'M' } });
    expect(screen.queryByTestId('pending-input-field-error-name')).toBeNull();
  });
});
