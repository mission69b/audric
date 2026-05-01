// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B2.3 — ToolBlockView smoke tests
//
// Surface-level checks: header label is right, progress bar shows when
// running, error path collapses to no result card, and `headerless`
// suppresses the AgentStep + progress (used by ParallelToolsGroup).
//
// We use `balance_check` (a registered tool) for label assertions and
// rely on ToolResultCard's null-fallback to keep the card layer trivial
// when we don't supply a real result shape.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ToolBlockView } from '../ToolBlockView';
import type { ToolTimelineBlock } from '@/lib/engine-types';

const BASE: ToolTimelineBlock = {
  type: 'tool',
  toolUseId: 't1',
  toolName: 'balance_check',
  input: { wallet: '0x1' },
  status: 'running',
  startedAt: 0,
};

describe('ToolBlockView', () => {
  it('shows the AgentStep header with the canonical label for a known tool', () => {
    const { getByText } = render(<ToolBlockView block={BASE} />);
    expect(getByText('BALANCE CHECK')).toBeTruthy();
  });

  it('renders the progress message + percentage when the tool is running', () => {
    const { getByText } = render(
      <ToolBlockView
        block={{ ...BASE, progress: { message: 'fetching balances…', pct: 60 } }}
      />,
    );
    expect(getByText('fetching balances…')).toBeTruthy();
    expect(getByText('60%')).toBeTruthy();
  });

  it('hides the progress line in headerless mode (group renders one combined header)', () => {
    const { queryByText } = render(
      <ToolBlockView
        block={{ ...BASE, progress: { message: 'fetching balances…', pct: 60 } }}
        headerless
      />,
    );
    expect(queryByText('fetching balances…')).toBeNull();
    expect(queryByText('BALANCE CHECK')).toBeNull();
  });

  it('does NOT render the result card while the message is still streaming', () => {
    const settled: ToolTimelineBlock = {
      ...BASE,
      status: 'done',
      endedAt: 1000,
      result: { data: { USDC: { saveApy: 0.05, borrowApy: 0.07 } } },
      isError: false,
    };
    // isStreaming=true blocks ToolResultCard from rendering even when settled.
    const { queryByText } = render(<ToolBlockView block={settled} isStreaming />);
    // Header still renders, but card content does not (verified by absence of
    // any rates-card text — RatesCard would surface the % values).
    expect(queryByText(/5\.00%|0\.05/)).toBeNull();
  });

  it('renders the header on error but no result card', () => {
    const errored: ToolTimelineBlock = {
      ...BASE,
      status: 'error',
      endedAt: 1000,
      result: 'boom',
      isError: true,
    };
    const { getByText, queryByText } = render(<ToolBlockView block={errored} />);
    expect(getByText('BALANCE CHECK')).toBeTruthy();
    // ToolResultCard returns null for isError === true, so the result text
    // never makes it to the DOM.
    expect(queryByText('boom')).toBeNull();
  });

  it('falls back to a humanized label for an unknown tool', () => {
    const { getByText } = render(
      <ToolBlockView block={{ ...BASE, toolName: 'noop_test_tool' }} />,
    );
    expect(getByText('NOOP TEST TOOL')).toBeTruthy();
  });

  // ───────────────────────────────────────────────────────────────────────
  // [SPEC 8 v0.5.1 B3.2] attemptCount surface
  // ───────────────────────────────────────────────────────────────────────

  it('shows "attempt N · 1.4s" subtitle when the tool retried (attemptCount > 1)', () => {
    const settled: ToolTimelineBlock = {
      ...BASE,
      status: 'done',
      startedAt: 0,
      endedAt: 1400,
      result: null,
      isError: false,
      attemptCount: 2,
    };
    const { getByText } = render(<ToolBlockView block={settled} />);
    expect(getByText(/· attempt 2 · 1\.4s/)).toBeTruthy();
  });

  it('shows "attempt N" alone while still running on a retry (no endedAt yet)', () => {
    const retrying: ToolTimelineBlock = {
      ...BASE,
      status: 'running',
      startedAt: 0,
      attemptCount: 3,
    };
    const { getByText, queryByText } = render(<ToolBlockView block={retrying} />);
    expect(getByText(/· attempt 3/)).toBeTruthy();
    expect(queryByText(/\ds/)).toBeNull();
  });

  it('omits the subtitle entirely on a 1st-try success (no attemptCount)', () => {
    const settled: ToolTimelineBlock = {
      ...BASE,
      status: 'done',
      startedAt: 0,
      endedAt: 1400,
      result: null,
      isError: false,
      // attemptCount intentionally omitted
    };
    const { queryByText } = render(<ToolBlockView block={settled} />);
    // The dot prefix " · " only renders when meta is present, so the absence
    // of any "attempt" / duration text confirms the header stays clean.
    expect(queryByText(/attempt/)).toBeNull();
    expect(queryByText(/1\.4s/)).toBeNull();
  });

  it('omits the subtitle when attemptCount is exactly 1 (defensive against engine misbehavior)', () => {
    const settled: ToolTimelineBlock = {
      ...BASE,
      status: 'done',
      startedAt: 0,
      endedAt: 1400,
      result: null,
      isError: false,
      attemptCount: 1,
    };
    const { queryByText } = render(<ToolBlockView block={settled} />);
    expect(queryByText(/attempt/)).toBeNull();
  });

  it('hides the subtitle in headerless mode (group renders the combined header)', () => {
    const settled: ToolTimelineBlock = {
      ...BASE,
      status: 'done',
      startedAt: 0,
      endedAt: 1400,
      result: null,
      isError: false,
      attemptCount: 2,
    };
    const { queryByText } = render(<ToolBlockView block={settled} headerless />);
    expect(queryByText(/attempt 2/)).toBeNull();
  });
});
