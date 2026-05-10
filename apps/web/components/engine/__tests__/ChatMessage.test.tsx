// ───────────────────────────────────────────────────────────────────────────
// SPEC 23A-P0 (2026-05-11) — ChatMessage rendering (post-rip)
//
// Pre-rip this file gated tests by `pinnedHarnessVersion` to drive the
// v2-vs-legacy renderer choice. Post-rip the gate is gone and every
// assistant turn renders via `<ReasoningTimeline>` (when there's a
// timeline) or the defensive bare-text fallback (when there isn't).
//
// The `pinnedHarnessVersion` prop stays on the interface for one
// release cycle so the upstream `<UnifiedTimeline>` doesn't need a
// coordinated edit. Tests confirm the prop is now a no-op.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const mockEnv = {
  NEXT_PUBLIC_INTERACTIVE_HARNESS: undefined as string | undefined,
  // The full env type is large; only the keys actually read by the
  // modules-under-test matter here. Other env reads route through
  // unrelated modules that are not exercised by these renders.
};

vi.mock('@/lib/env', () => ({
  get env() {
    return mockEnv;
  },
}));

import { ChatMessage } from '../ChatMessage';
import type { EngineChatMessage } from '@/lib/engine-types';

const ASSISTANT_BASE: EngineChatMessage = {
  id: 'm1',
  role: 'assistant',
  content: 'Here is your balance.',
  timestamp: 0,
};

const ASSISTANT_WITH_TIMELINE: EngineChatMessage = {
  ...ASSISTANT_BASE,
  timeline: [
    { type: 'text', text: 'Here is your balance.', status: 'done' },
  ],
};

describe('ChatMessage — rendering (post-SPEC-23A-P0)', () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = undefined;
  });

  it('user role renders the user bubble regardless of pinnedHarnessVersion', () => {
    const userMsg: EngineChatMessage = {
      id: 'u1',
      role: 'user',
      content: 'show my balance',
      timestamp: 0,
    };
    const { getByText, getByLabelText } = render(
      <ChatMessage message={userMsg} pinnedHarnessVersion="v2" />,
    );
    expect(getByText('show my balance')).toBeTruthy();
    expect(getByLabelText('Your message')).toBeTruthy();
  });

  it('assistant + populated timeline → renders the v2 timeline path', () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '0';
    const { container } = render(
      <ChatMessage
        message={ASSISTANT_WITH_TIMELINE}
        pinnedHarnessVersion="v2"
      />,
    );
    expect(container.querySelector('[aria-label="Audric response"]')).not.toBeNull();
    expect(container.textContent).toContain('Here is your balance.');
  });

  it('pinnedHarnessVersion="legacy" is now ignored — still renders v2 (no legacy renderer left)', () => {
    // Pre-rip this would have routed to <LegacyReasoningRender>. Post-rip
    // the prop is a no-op; the v2 timeline renders regardless.
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    const { container } = render(
      <ChatMessage
        message={ASSISTANT_WITH_TIMELINE}
        pinnedHarnessVersion="legacy"
      />,
    );
    expect(container.querySelector('[aria-label="Audric response"]')).not.toBeNull();
    expect(container.textContent).toContain('Here is your balance.');
  });

  it('pinnedHarnessVersion=null is now ignored — still renders v2', () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = undefined;
    const { container } = render(
      <ChatMessage
        message={ASSISTANT_WITH_TIMELINE}
        pinnedHarnessVersion={null}
      />,
    );
    expect(container.textContent).toContain('Here is your balance.');
  });

  it('empty timeline → defensive bare-text fallback renders message.content', () => {
    // Post-rip: when message.timeline is empty/missing the renderer
    // falls back to a minimal <div> with message.content. Engine
    // ≥1.4.0 always emits a timeline, so this branch is unreachable
    // in production today (Upstash sessions all aged out within 24h),
    // but kept as a defensive surface so we never silently drop output.
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    const noTimelineMsg: EngineChatMessage = { ...ASSISTANT_BASE, timeline: [] };
    const { container } = render(
      <ChatMessage message={noTimelineMsg} pinnedHarnessVersion="v2" />,
    );
    expect(container.textContent).toContain('Here is your balance.');
  });
});
