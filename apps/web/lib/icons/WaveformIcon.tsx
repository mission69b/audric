import type { SVGProps } from 'react';

/**
 * Waveform / "speaking" icon — five tightly-spaced vertical bars in an
 * alternating equalizer rhythm (medium → tall → short → tall → medium).
 * Used for the voice mode trigger so the affordance reads as "voice"
 * rather than the literal microphone glyph (which carries a heavier
 * "recording" connotation). Matches Claude's voice button silhouette.
 *
 * Theme-aware via `stroke="currentColor"` — inherits the parent
 * button's text color so it adapts to light + dark themes automatically.
 */
export const WaveformIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={16}
    height={16}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <line x1="3" y1="5.5" x2="3" y2="10.5" />
    <line x1="5.5" y1="3" x2="5.5" y2="13" />
    <line x1="8" y1="6" x2="8" y2="10" />
    <line x1="10.5" y1="3" x2="10.5" y2="13" />
    <line x1="13" y1="5.5" x2="13" y2="10.5" />
  </svg>
);
