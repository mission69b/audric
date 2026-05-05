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

  it('falls back to AgentMarkdown when only spokenWordIndex is provided (audit polish)', () => {
    // Symmetric counterpart to the test above — covers the second
    // half-set permutation. Without a voiceSlice we have no spans to
    // partition, so spokenWordIndex alone is non-actionable and must
    // not silently activate voice rendering.
    const { container } = render(
      <TextBlockView block={TEXT} spokenWordIndex={0} />,
    );
    expect(container.querySelectorAll('span.transition-colors').length).toBe(0);
  });

  // ─── SPEC 9 v0.1.1 P9.2 — proactive insight lockup styling ───────────────
  describe('proactive insight lockup', () => {
    const PROACTIVE_TEXT: TextTimelineBlock = {
      type: 'text',
      text: 'You have 1,200 USDC sitting idle. Saving it earns ~5% APY.',
      status: 'done',
      proactive: {
        proactiveType: 'idle_balance',
        subjectKey: 'USDC',
        suppressed: false,
      },
    };

    it('renders the lockup badge + dim border + italic body when proactive is set and not suppressed', () => {
      const { container } = render(<TextBlockView block={PROACTIVE_TEXT} />);

      // Lockup badge with the ✦ ADDED BY AUDRIC text + a11y label.
      const badge = screen.getByLabelText('proactive insight');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('ADDED BY AUDRIC');

      // Outer envelope owns the border-left accent.
      const outer = container.firstElementChild as HTMLElement | null;
      expect(outer?.className).toContain('border-l-2');
      expect(outer?.className).toContain('border-info-solid/30');

      // Body wrapper carries the italic class so the LLM's prose reads
      // as narrative-aside rather than a plain answer line.
      const italic = container.querySelector('.italic');
      expect(italic).toBeTruthy();
      expect(italic?.textContent).toContain('1,200 USDC');
    });

    it('renders as a plain text block (no lockup) when proactive is suppressed by cooldown', () => {
      const { container } = render(
        <TextBlockView
          block={{
            ...PROACTIVE_TEXT,
            proactive: {
              proactiveType: 'idle_balance',
              subjectKey: 'USDC',
              suppressed: true,
            },
          }}
        />,
      );

      // No lockup badge.
      expect(screen.queryByLabelText('proactive insight')).toBeNull();
      // No border-left envelope.
      const outer = container.firstElementChild as HTMLElement | null;
      expect(outer?.className ?? '').not.toContain('border-l-2');
      // No italic styling on the body.
      expect(container.querySelector('.italic')).toBeNull();
      // Narrative still flows.
      expect(container.textContent).toContain('1,200 USDC');
    });

    it('strips a leaked <proactive> marker from streamed text (defensive)', () => {
      // Race window: the closing `</proactive>` arrives in `text_delta`
      // chunks before the engine emits `proactive_text`. We strip
      // pre-emptively in render so the user never sees the wrapper.
      const { container } = render(
        <TextBlockView
          block={{
            type: 'text',
            text: '<proactive type="hf_warning" subjectKey="1.45">HF dipped to 1.45 — consider repaying.</proactive>',
            status: 'done',
          }}
        />,
      );
      expect(container.textContent).toContain('HF dipped to 1.45');
      expect(container.textContent).not.toContain('<proactive');
      expect(container.textContent).not.toContain('</proactive>');
    });
  });
});
