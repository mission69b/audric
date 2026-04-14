import { ImageResponse } from 'next/og';
import type { WalletReportData } from '@/lib/report/types';

export const runtime = 'edge';
export const alt = 'Audric Wallet Report';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  let instrumentSerif: ArrayBuffer | null = null;
  try {
    instrumentSerif = await fetch(
      new URL('../../fonts/InstrumentSerif-Regular.ttf', import.meta.url)
    ).then((res) => res.arrayBuffer());
  } catch { /* fallback to Georgia */ }

  let netWorth = '—';
  let efficiency = '—';
  let suggestions = 0;

  try {
    const res = await fetch(`${BASE_URL}/api/report/${address}`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = (await res.json()) as WalletReportData;
      netWorth = `$${fmtCompact(data.portfolio.netWorth)}`;
      efficiency = `${data.yieldEfficiency.efficiencyPct.toFixed(0)}%`;
      suggestions = data.audricWouldDo.length;
    }
  } catch { /* render with defaults */ }

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
        {/* Subtle glow */}
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.04), transparent 70%)',
          }}
        />

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: instrumentSerif ? 'Instrument Serif' : 'Georgia',
              fontSize: 48,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'baseline',
            }}
          >
            <span>Wallet Report</span>
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 16,
              color: '#707070',
              letterSpacing: '0.04em',
            }}
          >
            {short}
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: 60,
            marginTop: 56,
          }}
        >
          <StatBlock label="NET WORTH" value={netWorth} />
          <StatBlock label="YIELD EFFICIENCY" value={efficiency} />
          <StatBlock label="SUGGESTIONS" value={String(suggestions)} />
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: instrumentSerif ? 'Instrument Serif' : 'Georgia',
              fontSize: 20,
              color: '#ffffff',
            }}
          >
            Audric
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              color: '#555555',
              letterSpacing: '0.05em',
            }}
          >
            audric.ai/report
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: instrumentSerif
        ? [{ name: 'Instrument Serif', data: instrumentSerif, style: 'normal' as const, weight: 400 as const }]
        : [],
    },
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#555555', letterSpacing: '0.12em' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 28, color: '#ffffff', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}
