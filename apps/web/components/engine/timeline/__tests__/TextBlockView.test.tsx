// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.4 — TextBlockView voice mode tests (audit Gap F)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextBlockView } from '../TextBlockView';
import type { TextTimelineBlock } from '@/lib/engine-types';
import type { TextBlockVoiceSlice } from '@/lib/voice/timeline-voice-slices';

const TEXT: TextTimelineBlock = { type: 'text', text: 'hello world', status: 'done' };

const SLICE: TextBlockVoiceSlice = {
  localSpans: [
    { word: 'hello', charStart: 0, charEnd: 5, startSec: 0 },
    { word: 'world', charStart: 6, charEnd: 11, startSec: 0.5 },
  ],
  firstGlobalWordIdx: 0,
};

describe('TextBlockView', () => {
  it('returns null on empty text', () => {
    const { container } = render(
      <TextBlockView block={{ type: 'text', text: '', status: 'done' }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders streamed text with the typing indicator while streaming', () => {
    const { container } = render(
      <TextBlockView
        block={{ type: 'text', text: 'partial', status: 'streaming' }}
      />,
    );
    expect(container.textContent).toContain('partial');
    // sr-only "Audric is typing" hint should appear during streaming.
    expect(screen.getByText('Audric is typing')).toBeTruthy();
  });

  it('renders <AgentMarkdown> for terminal text without voice props', () => {
    const { container } = render(<TextBlockView block={TEXT} />);
    // Markdown renders the text as-is (no inline word spans).
    expect(container.textContent).toContain('hello world');
    // No per-word spans → no extra <span class="text-fg-primary"> wrappers.
    expect(container.querySelectorAll('span.text-fg-primary').length).toBe(0);
  });

  it('switches to <VoiceHighlightedText> when voice slice + spokenWordIndex are provided', () => {
    const { container } = render(
      <TextBlockView block={TEXT} voiceSlice={SLICE} spokenWordIndex={0} />,
    );
    // VoiceHighlightedText emits an inner <span> per word with one of two
    // class signatures. Both 'hello' (spoken) and 'world' (unspoken) get
    // their own span — verify the count + spoken-color partition.
    const wordSpans = Array.from(
      container.querySelectorAll('span.transition-colors'),
    );
    expect(wordSpans.length).toBe(2);
    const primary = wordSpans.filter((el) =>
      el.className.includes('text-fg-primary'),
    );
    const muted = wordSpans.filter((el) => el.className.includes('text-fg-muted'));
    expect(primary).toHaveLength(1); // 'hello' spoken
    expect(muted).toHaveLength(1); // 'world' pending
  });

  it('does not switch to voice rendering while still streaming', () => {
    const { container } = render(
      <TextBlockView
        block={{ ...TEXT, status: 'streaming' }}
        voiceSlice={SLICE}
        spokenWordIndex={0}
      />,
    );
    // Streaming branch wins regardless of voice props (TTS only fires after
    // the response is done) — no two-tone span partitioning yet.
    expect(container.querySelectorAll('span.transition-colors').length).toBe(0);
  });

  it('falls back to AgentMarkdown when only one of voice props is provided', () => {
    // Defensive: voice is opt-in via BOTH props together. Half-set props
    // should NOT silently activate voice rendering.
    const { container } = render(
      <TextBlockView block={TEXT} voiceSlice={SLICE} />,
    );
    expect(container.querySelectorAll('span.transition-colors').length).toBe(0);
  });
});
