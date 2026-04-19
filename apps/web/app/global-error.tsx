'use client';

import { useEffect } from 'react';

// NOTE: this is rendered when the root layout itself fails. globals.css
// is therefore unavailable. All styling has to live inline. Hex values
// mirror the canonical light tokens in globals.css (n100/n200/n400/n600/n800).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error boundary]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
          background: '#F7F7F7',
          color: '#191919',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Display", Helvetica, Arial, sans-serif',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 384, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#8F8F8F',
                margin: 0,
              }}
            >
              Error
            </p>
            <h1
              style={{
                fontFamily: '"PT Serif", "Times New Roman", ui-serif, Georgia, serif',
                fontSize: 36,
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
                fontWeight: 500,
                margin: 0,
                color: '#191919',
              }}
            >
              Something broke.
            </h1>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: '#707070', margin: 0 }}>
              We hit an unexpected error. Your funds are safe — this is a display issue only.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
              <button
                onClick={reset}
                style={{
                  height: 48,
                  padding: '0 24px',
                  borderRadius: 1000,
                  border: 'none',
                  background: '#191919',
                  color: '#FFFFFF',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 13,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global error boundary has no router context */}
              <a
                href="/"
                style={{
                  height: 48,
                  padding: '0 24px',
                  borderRadius: 1000,
                  border: '1px solid #CCCCCC',
                  background: 'transparent',
                  color: '#191919',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 13,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Back to home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
