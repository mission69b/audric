import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Audric — Security",
  description:
    "Security posture, measures, and responsible disclosure for the Audric AI financial assistant.",
};

const T2000_GITHUB = "https://github.com/mission69b/t2000";
const AUDRIC_GITHUB = "https://github.com/mission69b/audric";

const SECURITY_MEASURES = [
  {
    title: "Non-Custodial",
    desc: "Your wallet is derived from your Google session via zkLogin (Mysten Labs Enoki). Private keys are never exposed to or stored by Audric.",
  },
  {
    title: "Sponsored Transactions",
    desc: "All transaction gas fees are sponsored via Enoki. You never need to hold SUI for gas — transactions are built server-side and signed client-side.",
  },
  {
    title: "Tiered Approval",
    desc: "Read-only tools execute automatically. Risky write operations (swaps, sends, borrows) require explicit user confirmation. Safe writes (deposits, repayments, staking) are auto-approved.",
  },
  {
    title: "Ephemeral Sessions",
    desc: "zkLogin keys are short-lived and bound to a single Sui epoch (~24 hours). Session data is not persisted after you close the app.",
  },
  {
    title: "Automated Scanning",
    desc: "GitHub Actions runs CodeQL static analysis and dependency audits on every push. Both the Audric app and the t2000 infrastructure are continuously scanned.",
  },
  {
    title: "Open Source",
    desc: "All code is publicly auditable. Audric and t2000 infrastructure are both open source on GitHub.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <header className="mb-12">
        <Link
          className="inline-block text-muted-foreground hover:text-foreground font-mono text-[10px] tracking-[0.12em] uppercase mb-8 transition-colors"
          href="/"
        >
          &larr; audric.ai
        </Link>
        <div className="flex items-center gap-3 mb-3">
          <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.1] tracking-[-0.01em] text-foreground">
            Security
          </h1>
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground bg-muted border border-border rounded-xs px-1.5 py-0.5 leading-none">
            beta
          </span>
        </div>
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
          Security measures · responsible disclosure
        </p>
      </header>

      {/* CI Badges */}
      <section className="mb-12">
        <h2 className="text-foreground font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
          CI / CD Pipeline
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`${AUDRIC_GITHUB}/actions/workflows/ci.yml`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {/* biome-ignore lint/performance/noImgElement: GitHub Actions
                badge SVG from raw.githubusercontent.com — dynamic SVG
                from external origin, next/image is the wrong primitive. */}
            <img
              alt="CI status"
              className="h-5"
              src={`${AUDRIC_GITHUB}/actions/workflows/ci.yml/badge.svg`}
            />
          </a>
          <a
            href={`${AUDRIC_GITHUB}/actions/workflows/security.yml`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {/* biome-ignore lint/performance/noImgElement: see note above. */}
            <img
              alt="Security status"
              className="h-5"
              src={`${AUDRIC_GITHUB}/actions/workflows/security.yml/badge.svg`}
            />
          </a>
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-3">
          Every push runs lint, typecheck, CodeQL analysis, and dependency
          audit.
        </p>
      </section>

      {/* Security Measures */}
      <section className="mb-12">
        <h2 className="text-foreground font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
          Security Measures
        </h2>
        <div className="grid gap-4">
          {SECURITY_MEASURES.map((m) => (
            <div className="border border-border rounded-lg p-4" key={m.title}>
              <h3 className="font-sans text-[14px] font-medium text-foreground mb-1.5">
                {m.title}
              </h3>
              <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                {m.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Infrastructure Audit */}
      <section className="mb-12">
        <h2 className="text-foreground font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
          Infrastructure Audit
        </h2>
        <div className="border border-border rounded-lg p-5 space-y-3">
          <p className="text-sm text-muted-foreground font-mono">
            Audric is built on t2000 infrastructure (SDK, engine, smart
            contracts) which has undergone a full-stack security review.
          </p>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 font-mono text-[10px] tracking-[0.1em] uppercase border rounded-xs text-success bg-success/10 border-success/40">
              20 / 22 remediated
            </span>
            <span className="px-2 py-1 font-mono text-[10px] tracking-[0.1em] uppercase border rounded-xs text-warning bg-warning/10 border-warning/40">
              2 deferred
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            No vulnerabilities enabling direct fund theft were found. All
            critical and high-severity findings have been remediated.
          </p>
          <a
            className="inline-block text-sm text-foreground font-mono underline underline-offset-2 hover:opacity-70"
            href={`${T2000_GITHUB}/blob/main/spec/archive/one-offs/SECURITY_AUDIT.md`}
            rel="noopener noreferrer"
            target="_blank"
          >
            View full audit report &rarr;
          </a>
        </div>
      </section>

      {/* Recent Advisories */}
      <section className="mb-12">
        <h2 className="text-foreground font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
          Recent Advisories
        </h2>
        <div className="border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="font-sans text-[14px] font-medium text-foreground">
                2026-05 — IDOR + cache + JWT-expiry class
              </p>
              <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                Server-side auth missing on read routes; forgeable header on
                user-namespace routes; CDN cache-poisoning on portfolio.
                Resolved 2026-05-14. No exploitation observed.
              </p>
            </div>
            <span className="px-2 py-1 font-mono text-[10px] tracking-[0.1em] uppercase border rounded-xs text-success bg-success/10 border-success/40 shrink-0">
              Resolved
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono italic">
            Full advisory archived alongside apps/web (2026-05-22). Summary
            above is the canonical public record; reach out via responsible
            disclosure below if you need the original report.
          </p>
        </div>
      </section>

      {/* Responsible Disclosure */}
      <section className="mb-12">
        <h2 className="text-foreground font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
          Responsible Disclosure
        </h2>
        <div className="border border-border rounded-lg p-5 space-y-3 font-mono text-[13px]">
          <p className="text-muted-foreground">
            If you discover a security vulnerability, please report it
            responsibly.{" "}
            <strong className="text-foreground">
              Do not open a public GitHub issue.
            </strong>
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground w-24 shrink-0">
                Report
              </span>
              <a
                className="text-foreground underline underline-offset-2 hover:opacity-70"
                href={`${AUDRIC_GITHUB}/security/advisories/new`}
                rel="noopener noreferrer"
                target="_blank"
              >
                GitHub Security Advisory &rarr;
              </a>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground w-24 shrink-0">
                Response
              </span>
              <span className="text-foreground">
                Acknowledgment within 48 hours
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground w-24 shrink-0">Email</span>
              <span className="text-foreground">security@t2000.ai</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
