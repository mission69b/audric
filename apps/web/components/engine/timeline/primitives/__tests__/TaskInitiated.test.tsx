// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — TaskInitiated primitive smoke tests (audit Gap C)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TaskInitiated } from '../TaskInitiated';

describe('TaskInitiated', () => {
  it('renders the default "TASK INITIATED" label between two em-rules', () => {
    const { container, getByText } = render(<TaskInitiated />);
    expect(getByText('TASK INITIATED')).toBeTruthy();
    // Em-rules are aria-hidden divs flanking the label (flex-1 fills).
    const rules = container.querySelectorAll('[aria-hidden="true"]');
    expect(rules.length).toBe(2);
  });

  it('renders a custom label override (used by future RESUMED beat)', () => {
    const { getByText, queryByText } = render(<TaskInitiated label="RESUMED" />);
    expect(getByText('RESUMED')).toBeTruthy();
    expect(queryByText('TASK INITIATED')).toBeNull();
  });

  it('exposes a separator role with the label as aria-label', () => {
    const { getByRole } = render(<TaskInitiated />);
    const sep = getByRole('separator');
    expect(sep.getAttribute('aria-label')).toBe('TASK INITIATED');
  });
});
