import { ImageResponse } from 'next/og';
import { isReserved } from '@/lib/identity/reserved-usernames';
import { validateAudricLabel } from '@/lib/identity/validate-label';

// ---------------------------------------------------------------------------
// S.89 — per-username Twitter / Open Graph card
//
// When a user shares their `audric.ai/<handle>` URL on X (or any platform
// that reads OG meta), the social platform fetches THIS route to render
// the inline preview card. The site-wide root `app/opengraph-image.tsx`
// would otherwise be used — generic Audric branding, no handle context.
// This per-username override gives every shared link a personalised hero
// card with the handle in 64px serif and the brand mark.
//
// Validation strategy: format + reserved-list ONLY (no SuiNS RPC).
// Rationale:
//   • The image is a pure function of the URL param; no other data needed.
//   • SuiNS RPC at the OG-image edge has no retry budget — a flaky lookup
//     would render a generic fallback for a valid handle, which is a
//     worse outcome than a "preview-without-on-chain-check" image for
//     a handle that doesn't exist (the linked page itself still 404s
//     correctly via the page's own RPC check).
//   • Performance — OG image generation is rate-sensitive (X retries
//     aggressively if the image takes >2-3s); skipping RPC keeps us
//     well inside that budget.
//
// Reserved + invalid handles fall back to the generic Audric card so
// shares of `audric.ai/admin` or `audric.ai/-bad` don't render
// authoritative-looking handle cards.
// ---------------------------------------------------------------------------

export const runtime = 'edge';
export const alt = 'Audric Passport';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// [S.118 follow-up 2026-05-08] Display switched to the `@audric` short-form
// alias. The on-chain NFT name is still `<label>.audric.sui` (handled by
// the API routes); only the user-facing share-card hero flips to `@`.
const PARENT_SUFFIX = '@audric';

const DIAMOND: [number, number][] = [
  [0, 2],
  [1, 1], [1, 3],
  [2, 0], [2, 2], [2, 4],
  [3, 1], [3, 3],
  [4, 2],
];

interface ImageProps {
  params: { username: string };
}

export default async function Image({ params }: ImageProps) {
  const validation = validateAudricLabel(params.username);
  const isValidHandle = validation.valid && !isReserved(validation.label);
  const label = isValidHandle ? validation.label : null;
  const fullHandle = label ? `${label}${PARENT_SUFFIX}` : null;

  const [instrumentSerif, departureMono] = await Promise.all([
    fetch(new URL('../fonts/InstrumentSerif-Regular.ttf', import.meta.url))
      .then((res) => res.arrayBuffer())
      .catch(() => null),
    fetch(new URL('../fonts/DepartureMono-Regular.otf', import.meta.url))
      .then((res) => res.arrayBuffer())
      .catch(() => null),
  ]);

  // Adjust hero font size to fit longer handles within the card width.
  // 64px is comfortable up to ~16 chars; longer handles (e.g.
  // `verylonghandle@audric` = 21 chars) need shrinking. Cap at 50px for
  // the hard-floor 20-char-label case — `aaaaaaaaaaaaaaaaaaaa@audric`
  // = 27 chars total fits at 60px. (Previously sized for the `.audric.sui`
  // suffix — the new `@audric` form is 4 chars shorter, so existing
  // breakpoints have headroom; values kept conservative to preserve
  // visual rhythm.)
  const heroSize = !fullHandle
    ? 88
    : fullHandle.length <= 18
      ? 84
      : fullHandle.length <= 22
        ? 72
        : fullHandle.length <= 26
          ? 60
          : 50;

  const cellSize = 24;
  const gap = 7;
  const gridTotal = 5 * cellSize + 4 * gap;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#191919',
          position: 'relative',
        }}
      >
        {/* Subtle radial glow — same posture as the root OG image */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -55%)',
            width: 900,
            height: 900,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(255,255,255,0.04), transparent 70%)',
          }}
        />

        {/* Top dither bar — matches the in-app `<UsernameClaimSuccess>` hero */}
        <div
          style={{
            display: 'flex',
            color: '#5c8a5c',
            fontSize: 16,
            fontFamily: departureMono ? 'Departure Mono' : 'monospace',
            letterSpacing: '0.16em',
            marginBottom: 56,
          }}
        >
          ▓▒░&nbsp;&nbsp;YOUR PASSPORT&nbsp;&nbsp;░▒▓
        </div>

        {/* Hero handle (or generic Audric mark for invalid handles) */}
        {fullHandle ? (
          <div
            style={{
              display: 'flex',
              maxWidth: 1080,
              fontFamily: instrumentSerif ? 'Instrument Serif' : 'Georgia',
              fontSize: heroSize,
              color: '#ffffff',
              letterSpacing: '-0.01em',
              lineHeight: 1.05,
              textAlign: 'center',
              wordBreak: 'break-all',
            }}
          >
            {fullHandle}
          </div>
        ) : (
          // Fallback for invalid / reserved handles — render the generic
          // Audric mark + wordmark instead of an authoritative-looking
          // handle card. Same visual primitive as the root OG image.
          <>
            <div
              style={{
                position: 'relative',
                width: gridTotal,
                height: gridTotal,
                display: 'flex',
                flexWrap: 'wrap',
                marginBottom: 28,
              }}
            >
              {DIAMOND.map(([row, col]) => (
                <div
                  key={`${row}-${col}`}
                  style={{
                    position: 'absolute',
                    left: col * (cellSize + gap),
                    top: row * (cellSize + gap),
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 4,
                    background: '#ffffff',
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                fontFamily: instrumentSerif ? 'Instrument Serif' : 'Georgia',
                fontSize: heroSize,
              }}
            >
              <span style={{ color: '#ffffff' }}>Audr</span>
              <span style={{ color: '#555555' }}>\</span>
              <span style={{ color: '#ffffff' }}>c</span>
            </div>
          </>
        )}

        {/* Tagline */}
        <div
          style={{
            color: '#9a9a9a',
            fontSize: 18,
            fontFamily: 'Georgia',
            fontStyle: 'italic',
            marginTop: 36,
            textAlign: 'center',
          }}
        >
          {fullHandle
            ? 'Yours on Sui — recognized everywhere'
            : 'Your money, handled.'}
        </div>

        {/* Footer URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#707070',
            fontSize: 14,
            fontFamily: departureMono ? 'Departure Mono' : 'monospace',
            letterSpacing: '0.05em',
          }}
        >
          <span style={{ color: '#a8a8a8' }}>🪪</span>
          <span>{label ? `audric.ai/${label}` : 'audric.ai'}</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        ...(instrumentSerif
          ? [
              {
                name: 'Instrument Serif',
                data: instrumentSerif,
                style: 'normal' as const,
                weight: 400 as const,
              },
            ]
          : []),
        ...(departureMono
          ? [
              {
                name: 'Departure Mono',
                data: departureMono,
                style: 'normal' as const,
                weight: 400 as const,
              },
            ]
          : []),
      ],
    },
  );
}
