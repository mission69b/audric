import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Audric — Security',
  description:
    'Security posture, measures, and responsible disclosure for the Audric AI financial assistant.',
};

const T2000_GITHUB = 'https://github.com/mission69b/t2000';
const AUDRIC_GITHUB = 'https://github.com/mission69b/audric';

const SECURITY_MEASURES = [
  {
    title: 'Non-Custodial',
    desc: 'Your wallet is derived from your Google session via zkLogin (Mysten Labs Enoki). Private keys are never exposed to or stored by Audric.',
  },
  {
    title: 'Sponsored Transactions',
    desc: 'All transaction gas fees are sponsored via Enoki. You never need to hold SUI for gas — transactions are built server-side and signed client-side.',
  },
  {
    title: 'Tiered Approval',
    desc: 'Read-only tools execute automatically. Risky write operations (swaps, sends, borrows) require explicit user confirmation. Safe writes (deposits, repayments, staking) are auto-approved.',
  },
  {
    title: 'Ephemeral Sessions',
    desc: 'zkLogin keys are short-lived and bound to a single Sui epoch (~24 hours). Session data is not persisted after you close the app.',
  },
  {
    title: 'Automated Scanning',
    desc: 'GitHub Actions runs CodeQL static analysis and dependency audits on every push. Both the Audric app and the t2000 infrastructure are continuously scanned.',
  },
  {
    title: 'Open Source',
    desc: 'All code is publicly auditable. Audric and t2000 infrastructure are both open source on GitHub.',
  },
];

export default function SecurityPage() {
  return (
    <>
      <header className="mb-12">
        <Link
          href="/"
          className="inline-block text-muted hover:text-foreground font-mono text-[10px] tracking-[0.12em] uppercase mb-8 transition-colors"
        >
          &larr; audric.ai
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-mono font-semibold text-foreground tracking-tight">
            Security
          </h1>
          <span className="text-[9px] uppercase tracking-widest font-medium text-muted border border-border rounded px-1.5 py-0.5 leading-none">
            beta
          </span>
        </div>
        <p className="text-sm text-muted font-mono">
          Security measures and responsible disclosure
        </p>
      </header>

      {/* CI Badges */}
      <section className="mb-12">
        <h2 className="text-foreground text-base font-mono font-semibold mb-4">
          CI / CD Pipeline
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`${AUDRIC_GITHUB}/actions/workflows/ci.yml`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${AUDRIC_GITHUB}/actions/workflows/ci.yml/badge.svg`}
              alt="CI status"
              className="h-5"
            />
          </a>
          <a
            href={`${AUDRIC_GITHUB}/actions/workflows/security.yml`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${AUDRIC_GITHUB}/actions/workflows/security.yml/badge.svg`}
              alt="Security status"
              className="h-5"
            />
          </a>
        </div>
        <p className="text-xs text-muted font-mono mt-3">
          Every push runs lint, typecheck, CodeQL analysis, and dependency
          audit.
        </p>
      </section>

      {/* Security Measures */}
      <section className="mb-12">
        <h2 className="text-foreground text-base font-mono font-semibold mb-4">
          Security Measures
        </h2>
        <div className="grid gap-4">
          {SECURITY_MEASURES.map((m) => (
            <div
              key={m.title}
              className="border border-border rounded-lg p-4"
            >
              <h3 className="text-sm text-foreground font-mono font-semibold mb-1">
                {m.title}
              </h3>
              <p className="text-xs text-muted font-mono leading-relaxed">
                {m.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Infrastructure Audit */}
      <section className="mb-12">
        <h2 className="text-foreground text-base font-mono font-semibold mb-4">
          Infrastructure Audit
        </h2>
        <div className="border border-border rounded-lg p-5 space-y-3">
          <p className="text-sm text-muted font-mono">
            Audric is built on t2000 infrastructure (SDK, engine, smart
            contracts) which has undergone a full-stack security review.
          </p>
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-[11px] font-mono font-semibold border rounded text-emerald-400 bg-emerald-400/10 border-emerald-400/20">
              20 / 22 REMEDIATED
            </span>
            <span className="px-2.5 py-1 text-[11px] font-mono font-semibold border rounded text-amber-400 bg-amber-400/10 border-amber-400/20">
              2 DEFERRED
            </span>
          </div>
          <p className="text-xs text-muted font-mono">
            No vulnerabilities enabling direct fund theft were found. All
            critical and high-severity findings have been remediated.
          </p>
          <a
            href={`${T2000_GITHUB}/blob/main/SECURITY_AUDIT.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-foreground font-mono underline underline-offset-2 hover:opacity-70"
          >
            View full audit report &rarr;
          </a>
        </div>
      </section>

      {/* Responsible Disclosure */}
      <section className="mb-12">
        <h2 className="text-foreground text-base font-mono font-semibold mb-4">
          Responsible Disclosure
        </h2>
        <div className="border border-border rounded-lg p-5 space-y-3 font-mono text-[13px]">
          <p className="text-muted">
            If you discover a security vulnerability, please report it
            responsibly.{' '}
            <strong className="text-foreground">
              Do not open a public GitHub issue.
            </strong>
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-muted w-24 shrink-0">Report</span>
              <a
                href={`${AUDRIC_GITHUB}/security/advisories/new`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:opacity-70"
              >
                GitHub Security Advisory &rarr;
              </a>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted w-24 shrink-0">Response</span>
              <span className="text-foreground">
                Acknowledgment within 48 hours
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted w-24 shrink-0">Email</span>
              <span className="text-foreground">security@t2000.ai</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
