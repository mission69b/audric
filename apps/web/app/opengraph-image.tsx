import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Audric — Your money, handled.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const DIAMOND: [number, number][] = [
  [0, 2],
  [1, 1], [1, 3],
  [2, 0], [2, 2], [2, 4],
  [3, 1], [3, 3],
  [4, 2],
];

export default async function Image() {
  const instrumentSerif = await fetch(
    new URL('https://fonts.gstatic.com/s/instrumentserif/v4/jizBRFtNs2ka5fCjOQ3.woff2')
  ).then((res) => res.arrayBuffer()).catch(() => null);

  const cellSize = 36;
  const gap = 10;
  const gridTotal = 5 * cellSize + 4 * gap;
  const markX = (1200 - gridTotal) / 2;
  const markY = 140;

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
        {/* Subtle radial glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -60%)',
            width: 800,
            height: 800,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.03), transparent 70%)',
          }}
        />

        {/* Diamond mark */}
        <div style={{ position: 'relative', width: gridTotal, height: gridTotal, display: 'flex', flexWrap: 'wrap', marginTop: -40 }}>
          {DIAMOND.map(([row, col]) => (
            <div
              key={`${row}-${col}`}
              style={{
                position: 'absolute',
                left: col * (cellSize + gap),
                top: row * (cellSize + gap),
                width: cellSize,
                height: cellSize,
                borderRadius: 5,
                background: '#ffffff',
              }}
            />
          ))}
        </div>

        {/* Text */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            marginTop: 48,
            fontFamily: instrumentSerif ? 'Instrument Serif' : 'Georgia',
            fontSize: 64,
          }}
        >
          <span style={{ color: '#ffffff' }}>Audr</span>
          <span style={{ color: '#555555' }}>\</span>
          <span style={{ color: '#ffffff' }}>c</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            color: '#707070',
            fontSize: 15,
            fontFamily: 'monospace',
            marginTop: 16,
            letterSpacing: '0.04em',
          }}
        >
          Your money, handled.
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            color: '#555555',
            fontSize: 12,
            fontFamily: 'monospace',
            letterSpacing: '0.05em',
          }}
        >
          audric.ai
        </div>
      </div>
    ),
    {
      ...size,
      fonts: instrumentSerif
        ? [{ name: 'Instrument Serif', data: instrumentSerif, style: 'normal', weight: 400 }]
        : [],
    }
  );
}
