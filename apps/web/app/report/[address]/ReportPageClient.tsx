'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { WalletReportData, RiskSeverity } from '@/lib/report/types';
import { truncateAddress } from '@/lib/format';

interface Props {
  address: string;
}

export function ReportPageClient({ address }: Props) {
  const [report, setReport] = useState<WalletReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/report/${address}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: WalletReportData) => setReport(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [address]);

  if (loading) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 min-h-screen">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto" />
          <p className="font-mono text-xs text-muted tracking-wider uppercase">Analyzing wallet...</p>
          <p className="font-mono text-[10px] text-dim">{truncateAddress(address)}</p>
        </div>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 min-h-screen">
        <div className="text-center space-y-3">
          <p className="text-lg text-foreground">Unable to generate report</p>
          <p className="text-sm text-muted">{error ?? 'Unknown error'}</p>
          <Link
            href="/report"
            className="inline-block rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground transition mt-4"
          >
            Try another address
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center pt-10 pb-16 px-4">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <Link
              href="/report"
              className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition mb-2"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              New report
            </Link>
            <h1 className="font-mono text-xs text-foreground truncate">{address}</h1>
            <p className="font-mono text-[10px] text-dim">
              Generated {new Date(report.generatedAt).toLocaleString()}
            </p>
          </div>
          <ShareCluster address={address} report={report} summaryRef={summaryRef} />
        </header>

        {/* Portfolio summary */}
        <div ref={summaryRef}>
          <Card title="Portfolio">
            <div className="space-y-4">
              <div className="space-y-0.5">
                <span className="font-mono text-[10px] tracking-wider text-dim uppercase">Net Worth</span>
                <div className="font-mono text-2xl text-foreground font-medium">
                  ${fmtUsd(report.portfolio.netWorth)}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Stat label="Wallet" value={`$${fmtUsd(report.portfolio.totalUsd)}`} />
                <Stat label="Savings" value={`$${fmtUsd(report.portfolio.savings)}`} className="text-success" />
                {report.portfolio.debt >= 0.01 && (
                  <Stat label="Debt" value={`-$${fmtUsd(report.portfolio.debt)}`} className="text-error" />
                )}
              </div>

              {report.portfolio.tokens.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  {report.portfolio.tokens.map((t) => (
                    <div key={t.symbol} className="flex items-center justify-between font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{t.symbol}</span>
                        <span className="text-dim">{t.pct.toFixed(1)}%</span>
                      </div>
                      <span className="text-muted">${fmtUsd(t.usd)}</span>
                    </div>
                  ))}
                </div>
              )}

              {report.portfolio.supplies.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <span className="font-mono text-[10px] tracking-wider text-dim uppercase">Savings Positions</span>
                  {report.portfolio.supplies.map((s, i) => (
                    <div key={i} className="flex items-center justify-between font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{s.asset}</span>
                        <span className="text-success text-[10px]">{s.apy.toFixed(2)}%</span>
                      </div>
                      <span className="text-muted">${fmtUsd(s.amountUsd)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Yield efficiency */}
        <Card title="Yield Efficiency">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <EfficiencyGauge pct={report.yieldEfficiency.efficiencyPct} />
              <div className="space-y-1">
                <div className="font-mono text-sm text-foreground">
                  {report.yieldEfficiency.efficiencyPct.toFixed(0)}% efficient
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  ${fmtUsd(report.yieldEfficiency.earningUsd)} earning yield
                  {report.yieldEfficiency.idleStablesUsd > 0 && (
                    <>, ${fmtUsd(report.yieldEfficiency.idleStablesUsd)} idle</>
                  )}
                </p>
              </div>
            </div>

            {report.yieldEfficiency.opportunityCostMonthly > 0.01 && (
              <div className="rounded-lg bg-surface border border-border p-3">
                <p className="text-xs text-muted leading-relaxed">
                  <span className="text-warning font-medium">Opportunity cost:</span>{' '}
                  ~${fmtUsd(report.yieldEfficiency.opportunityCostMonthly)}/month in potential yield on idle stables
                </p>
              </div>
            )}

            {report.yieldEfficiency.estimatedDailyYield > 0 && (
              <div className="font-mono text-xs text-dim">
                Earning ~${report.yieldEfficiency.estimatedDailyYield.toFixed(4)}/day
                {report.yieldEfficiency.weightedApy > 0 && (
                  <> at {report.yieldEfficiency.weightedApy.toFixed(2)}% APY</>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Activity */}
        <Card title="Activity">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="30-day txns" value={String(report.activity.txCount30d)} />
            <Stat label="90-day txns" value={String(report.activity.txCount90d)} />
            <Stat label="Active days (30d)" value={String(report.activity.activeDays30d)} />
          </div>
          {report.activity.lastActiveDate && (
            <p className="font-mono text-[10px] text-dim mt-3">
              Last active: {new Date(report.activity.lastActiveDate).toLocaleDateString()}
            </p>
          )}
        </Card>

        {/* Patterns */}
        {report.patterns.length > 0 && (
          <Card title="Detected Patterns">
            <div className="space-y-3">
              {report.patterns.map((p) => (
                <div key={p.id} className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <div
                      className="h-2 w-2 rounded-full bg-accent"
                      style={{ opacity: p.confidence }}
                    />
                  </div>
                  <div>
                    <p className="text-sm text-foreground font-medium">{p.label}</p>
                    <p className="text-xs text-muted leading-relaxed">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Risk signals */}
        {report.riskSignals.length > 0 && (
          <Card title="Risk Signals">
            <div className="space-y-3">
              {report.riskSignals.map((r) => (
                <div key={r.id} className={`rounded-lg p-3 border ${severityStyles[r.severity]}`}>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs leading-relaxed mt-0.5 opacity-80">{r.description}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Audric would do */}
        <Card title="What Audric Would Do">
          <div className="space-y-4">
            {report.audricWouldDo.map((s) => (
              <div key={s.id} className="space-y-2">
                <p className="text-sm text-foreground font-medium">{s.headline}</p>
                <p className="text-xs text-muted leading-relaxed">{s.description}</p>
                {s.estimatedImpact && (
                  <span className="inline-block font-mono text-[10px] tracking-wider text-success bg-success/10 px-2 py-0.5 rounded">
                    {s.estimatedImpact}
                  </span>
                )}
              </div>
            ))}
            <Link
              href="/"
              className="block w-full rounded-xl bg-foreground py-3 font-mono text-[11px] tracking-[0.1em] text-background uppercase text-center hover:opacity-90 transition mt-2"
            >
              Try Audric Free
            </Link>
          </div>
        </Card>

        {/* Footer */}
        <footer className="text-center space-y-2 pt-4">
          <p className="text-xs text-dim">
            Powered by{' '}
            <Link href="/" className="text-muted hover:text-foreground transition underline underline-offset-2">
              Audric
            </Link>
            {' '}— Your money, handled.
          </p>
          <p className="text-[10px] text-dim leading-relaxed max-w-sm mx-auto">
            This report is for informational purposes only. Not financial advice.
            Data sourced from Sui blockchain and NAVI Protocol.
          </p>
        </footer>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Share cluster (E.2d)
// ---------------------------------------------------------------------------

function ShareCluster({
  address,
  report,
  summaryRef,
}: {
  address: string;
  report: WalletReportData;
  summaryRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const url = typeof window !== 'undefined' ? `${window.location.origin}/report/${address}` : '';
  const short = truncateAddress(address);
  const eff = report.yieldEfficiency.efficiencyPct.toFixed(0);
  const suggestions = report.audricWouldDo.length;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  const tweetText = encodeURIComponent(
    `My Sui wallet is ${eff}% yield-efficient with ${suggestions} actionable suggestions. Check yours:\n${url}\n\nPowered by @AudricAI`,
  );
  const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Sui wallet report for ${short}`)}`;

  const handleDownloadImage = useCallback(async () => {
    if (!summaryRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(summaryRef.current, {
        backgroundColor: '#191919',
        scale: 2,
      });
      const link = document.createElement('a');
      link.download = `audric-report-${address.slice(0, 8)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // html2canvas not available or failed
    }
  }, [summaryRef, address]);

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <ShareButton onClick={handleCopy} title="Copy link">
        {copied ? '✓' : '🔗'}
      </ShareButton>
      <ShareButton onClick={() => window.open(twitterUrl, '_blank')} title="Share on Twitter">
        𝕏
      </ShareButton>
      <ShareButton onClick={() => window.open(telegramUrl, '_blank')} title="Share on Telegram">
        ✈
      </ShareButton>
      <ShareButton onClick={handleDownloadImage} title="Download image">
        📷
      </ShareButton>
      <ShareButton onClick={() => setShowQr(!showQr)} title="QR code">
        ⬜
      </ShareButton>

      {showQr && (
        <div className="absolute right-4 top-24 z-50 bg-white p-3 rounded-xl shadow-lg">
          <QrCode url={url} />
          <p className="text-[9px] text-gray-500 text-center mt-1 font-mono">{short}</p>
        </div>
      )}
    </div>
  );
}

function ShareButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-xs hover:bg-surface hover:border-foreground/20 transition"
    >
      {children}
    </button>
  );
}

// Simple QR code using a public API
function QrCode({ url }: { url: string }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=191919`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={qrUrl} alt="QR Code" width={160} height={160} className="rounded" />
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface/50 p-5 space-y-4">
      <h2 className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="space-y-0.5">
      <span className="font-mono text-[9px] tracking-wider text-dim uppercase block">{label}</span>
      <span className={`font-mono text-sm font-medium ${className ?? 'text-foreground'}`}>{value}</span>
    </div>
  );
}

function EfficiencyGauge({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <svg width={72} height={72} viewBox="0 0 72 72" className="shrink-0">
      <circle cx="36" cy="36" r={radius} fill="none" strokeWidth={6} className="stroke-border" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 36 36)"
        className={clamped >= 50 ? 'stroke-success' : 'stroke-warning'}
      />
      <text x="36" y="40" textAnchor="middle" className="fill-foreground font-mono text-[13px] font-medium">
        {clamped.toFixed(0)}%
      </text>
    </svg>
  );
}

const severityStyles: Record<RiskSeverity, string> = {
  info: 'border-accent/20 bg-accent/5 text-accent',
  warning: 'border-warning/20 bg-warning/5 text-warning',
  danger: 'border-error/20 bg-error/5 text-error',
};

function fmtUsd(n: number): string {
  return n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : n.toFixed(2);
}
