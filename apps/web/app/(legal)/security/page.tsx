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
          className="inline-block text-fg-secondary hover:text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-8 transition-colors"
        >
          &larr; audric.ai
        </Link>
        <div className="flex items-center gap-3 mb-3">
          <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.1] tracking-[-0.01em] text-fg-primary">
            Security
          </h1>
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-fg-secondary bg-surface-sunken border border-border-subtle rounded-xs px-1.5 py-0.5 leading-none">
            beta
          </span>
        </div>
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          Security measures · responsible disclosure
        </p>
      </header>

      {/* CI Badges */}
      <section className="mb-12">
        <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
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
        <p className="text-xs text-fg-secondary font-mono mt-3">
          Every push runs lint, typecheck, CodeQL analysis, and dependency
          audit.
        </p>
      </section>

      {/* Security Measures */}
      <section className="mb-12">
        <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
          Security Measures
        </h2>
        <div className="grid gap-4">
          {SECURITY_MEASURES.map((m) => (
            <div
              key={m.title}
              className="border border-border-subtle rounded-lg p-4"
            >
              <h3 className="font-sans text-[14px] font-medium text-fg-primary mb-1.5">
                {m.title}
              </h3>
              <p className="text-xs text-fg-secondary font-mono leading-relaxed">
                {m.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Infrastructure Audit */}
      <section className="mb-12">
        <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
          Infrastructure Audit
        </h2>
        <div className="border border-border-subtle rounded-lg p-5 space-y-3">
          <p className="text-sm text-fg-secondary font-mono">
            Audric is built on t2000 infrastructure (SDK, engine, smart
            contracts) which has undergone a full-stack security review.
          </p>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 font-mono text-[10px] tracking-[0.1em] uppercase border rounded-xs text-success-fg bg-success-bg border-success-border/40">
              20 / 22 remediated
            </span>
            <span className="px-2 py-1 font-mono text-[10px] tracking-[0.1em] uppercase border rounded-xs text-warning-fg bg-warning-bg border-warning-border/40">
              2 deferred
            </span>
          </div>
          <p className="text-xs text-fg-secondary font-mono">
            No vulnerabilities enabling direct fund theft were found. All
            critical and high-severity findings have been remediated.
          </p>
          <a
            href={`${T2000_GITHUB}/blob/main/SECURITY_AUDIT.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-fg-primary font-mono underline underline-offset-2 hover:opacity-70"
          >
            View full audit report &rarr;
          </a>
        </div>
      </section>

      {/* Recent Advisories */}
      <section className="mb-12">
        <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
          Recent Advisories
        </h2>
        <div className="border border-border-subtle rounded-lg p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="font-sans text-[14px] font-medium text-fg-primary">
                2026-05 — IDOR + cache + JWT-expiry class
              </p>
              <p className="text-xs text-fg-secondary font-mono leading-relaxed">
                Server-side auth missing on read routes; forgeable header on
                user-namespace routes; CDN cache-poisoning on portfolio.
                Resolved 2026-05-14. No exploitation observed.
              </p>
            </div>
            <span className="px-2 py-1 font-mono text-[10px] tracking-[0.1em] uppercase border rounded-xs text-success-fg bg-success-bg border-success-border/40 shrink-0">
              Resolved
            </span>
          </div>
          <a
            href={`${AUDRIC_GITHUB}/blob/main/apps/web/SECURITY_ADVISORY_2026-05-IDOR.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-fg-primary font-mono underline underline-offset-2 hover:opacity-70"
          >
            Read full advisory &rarr;
          </a>
        </div>
      </section>

      {/* Responsible Disclosure */}
      <section className="mb-12">
        <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
          Responsible Disclosure
        </h2>
        <div className="border border-border-subtle rounded-lg p-5 space-y-3 font-mono text-[13px]">
          <p className="text-fg-secondary">
            If you discover a security vulnerability, please report it
            responsibly.{' '}
            <strong className="text-fg-primary">
              Do not open a public GitHub issue.
            </strong>
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-fg-secondary w-24 shrink-0">Report</span>
              <a
                href={`${AUDRIC_GITHUB}/security/advisories/new`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg-primary underline underline-offset-2 hover:opacity-70"
              >
                GitHub Security Advisory &rarr;
              </a>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-fg-secondary w-24 shrink-0">Response</span>
              <span className="text-fg-primary">
                Acknowledgment within 48 hours
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-fg-secondary w-24 shrink-0">Email</span>
              <span className="text-fg-primary">security@t2000.ai</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
