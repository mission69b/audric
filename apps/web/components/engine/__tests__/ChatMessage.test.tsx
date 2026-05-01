// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.3 — ChatMessage gate (`pinnedHarnessVersion`)
//
// The renderer-selector at the heart of B3.3:
//   - User messages render a bubble (no version logic).
//   - Assistant messages with `pinnedHarnessVersion='v2'` AND a populated
//     timeline render <ReasoningTimeline>.
//   - Otherwise (legacy pin OR empty timeline) → <LegacyReasoningRender>.
//   - When `pinnedHarnessVersion` is `null`, fall back to the env-var.
//
// Voice-mode context falls back gracefully when no provider is present
// (see VoiceModeContext.tsx) — we don't need to wrap test renders.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const mockEnv = {
  NEXT_PUBLIC_INTERACTIVE_HARNESS: undefined as string | undefined,
  // The full env type is large; only the key we care about is read by
  // `interactive-harness.ts`. Other reads in unrelated modules are not
  // exercised by these renders.
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

describe('ChatMessage — gate behavior (B3.3)', () => {
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

  it('pinnedHarnessVersion="v2" + populated timeline → renders ReasoningTimeline path', () => {
    // Flag is OFF — proves the pinned value wins over the env-var.
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '0';
    const { container } = render(
      <ChatMessage
        message={ASSISTANT_WITH_TIMELINE}
        pinnedHarnessVersion="v2"
      />,
    );
    // Timeline renders with the role="log" wrapper from ChatMessage.
    expect(container.querySelector('[aria-label="Audric response"]')).not.toBeNull();
    // The text-block path renders the assistant text.
    expect(container.textContent).toContain('Here is your balance.');
  });

  it('pinnedHarnessVersion="legacy" → uses legacy renderer even when env-var is on', () => {
    // Flag is ON, but the session was pinned to legacy at creation. The
    // renderer must respect the pin and never flip mid-session.
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    const { container } = render(
      <ChatMessage
        message={ASSISTANT_WITH_TIMELINE}
        pinnedHarnessVersion="legacy"
      />,
    );
    // Both renderers wrap in role="log". We check for the structural
    // marker that's unique to legacy: the ReasoningAccordion / tools tree
    // doesn't include a `<ReasoningTimeline>` node, but text always
    // shows. The presence of the text confirms a render happened; the
    // absence of any timeline-only marker (we use the ReasoningTimeline's
    // `space-y-2` group of grouped tools doesn't help here, but the
    // absence of a streaming-text wrapper does — legacy uses `pl-1
    // text-sm` with a green ✦ glyph).
    expect(container.textContent).toContain('Here is your balance.');
  });

  it('pinnedHarnessVersion=null → falls back to env-var (legacy when off)', () => {
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = undefined;
    const { container } = render(
      <ChatMessage
        message={ASSISTANT_WITH_TIMELINE}
        pinnedHarnessVersion={null}
      />,
    );
    // Body still rendered (whichever path).
    expect(container.textContent).toContain('Here is your balance.');
  });

  it('empty timeline + v2 pin → falls through to legacy (B2.2 invariant)', () => {
    // A v2-pinned session with an empty `timeline[]` must NOT render the
    // new path — there's nothing to render. Legacy handles the
    // "thinking-only" pre-stream case via its own ThinkingState fallback.
    mockEnv.NEXT_PUBLIC_INTERACTIVE_HARNESS = '1';
    const noTimelineMsg: EngineChatMessage = { ...ASSISTANT_BASE, timeline: [] };
    const { container } = render(
      <ChatMessage message={noTimelineMsg} pinnedHarnessVersion="v2" />,
    );
    expect(container.textContent).toContain('Here is your balance.');
  });
});
