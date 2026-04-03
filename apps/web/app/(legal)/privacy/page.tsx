import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Audric — Privacy Policy',
  description: 'Privacy policy for the Audric AI financial assistant.',
};

export default function PrivacyPage() {
  return (
    <>
      <header className="mb-12">
        <Link
          href="/"
          className="inline-block text-muted hover:text-foreground font-mono text-[10px] tracking-[0.12em] uppercase mb-8 transition-colors"
        >
          &larr; audric.ai
        </Link>
        <h1 className="text-2xl sm:text-3xl font-mono font-semibold text-foreground tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted font-mono">Last updated: April 2026</p>
      </header>

      <div className="space-y-8 text-muted leading-relaxed text-[13.5px]">
        <section>
          <h2 className="text-foreground text-base font-mono font-semibold mb-3">
            Overview
          </h2>
          <p>
            Audric is designed with privacy as a core principle. We collect
            minimal data, operate non-custodially, and never store your private
            keys. This policy covers the Audric web app at audric.ai.
          </p>
        </section>

        <section>
          <h2 className="text-foreground text-base font-mono font-semibold mb-3">
            What We Collect
          </h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-foreground">Email address</strong> &mdash;
              Collected via Google sign-in (zkLogin) for authentication. Used
              solely to derive your wallet address.
            </li>
            <li>
              <strong className="text-foreground">Sui wallet address</strong>{' '}
              &mdash; Generated via zkLogin (Mysten Labs Enoki). This is a
              public blockchain address derived from your Google session.
            </li>
            <li>
              <strong className="text-foreground">Chat messages</strong> &mdash;
              Sent to Anthropic&apos;s API for AI processing during your session.
              Not stored by Audric after your session ends. Subject to{' '}
              <a
                href="https://www.anthropic.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:opacity-70"
              >
                Anthropic&apos;s privacy policy
              </a>
              .
            </li>
            <li>
              <strong className="text-foreground">Saved contacts</strong> &mdash;
              Contact names and Sui addresses you save are stored in our database
              linked to your wallet address for convenience.
            </li>
            <li>
              <strong className="text-foreground">Website analytics</strong>{' '}
              &mdash; We use{' '}
              <a
                href="https://vercel.com/analytics"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:opacity-70"
              >
                Vercel Analytics
              </a>{' '}
              for anonymous, cookieless page view analytics.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-foreground text-base font-mono font-semibold mb-3">
            What We Do Not Collect
          </h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Private keys (managed by zkLogin/Enoki, never exposed to Audric)</li>
            <li>Passwords or PINs</li>
            <li>Government-issued identity documents</li>
            <li>Financial account numbers or credit card details</li>
            <li>IP addresses (not stored permanently)</li>
            <li>Browser cookies for tracking</li>
          </ul>
        </section>

        <section>
          <h2 className="text-foreground text-base font-mono font-semibold mb-3">
            Data Shared with Third Parties
          </h2>
          <p>
            When you use Audric, certain data is shared with upstream providers
            to fulfill your request. We do not sell or transfer data for
            advertising or profiling purposes.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong className="text-foreground">Anthropic</strong> &mdash; Chat
              messages for AI processing
            </li>
            <li>
              <strong className="text-foreground">Mysten Labs (Enoki)</strong>{' '}
              &mdash; Authentication and gas sponsorship
            </li>
            <li>
              <strong className="text-foreground">Google</strong> &mdash; OAuth
              sign-in via zkLogin
            </li>
            <li>
              <strong className="text-foreground">DeFi protocols</strong> (NAVI,
              Cetus, VOLO) &mdash; Via on-chain smart contracts (public
              blockchain data only)
            </li>
            <li>
              <strong className="text-foreground">Sui RPC nodes</strong> &mdash;
              For blockchain interaction
            </li>
            <li>
              <strong className="text-foreground">Vercel</strong> &mdash; App
              hosting and analytics
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-foreground text-base font-mono font-semibold mb-3">
            Data Storage
          </h2>
          <p>
            Chat messages are processed in-memory during your session and are
            not persisted by Audric. User preferences (saved contacts) are
            stored in a PostgreSQL database. Session data is stored temporarily
            in Redis and expires automatically.
          </p>
        </section>

        <section>
          <h2 className="text-foreground text-base font-mono font-semibold mb-3">
            Blockchain Data
          </h2>
          <p>
            All transactions executed through Audric are recorded on the Sui
            blockchain, which is a public, immutable ledger. Transaction data
            including wallet addresses, amounts, and timestamps are publicly
            visible. This is inherent to blockchain technology and not within
            our control.
          </p>
        </section>

        <section>
          <h2 className="text-foreground text-base font-mono font-semibold mb-3">
            Open Source
          </h2>
          <p>
            Audric is open source. You can verify exactly what data is collected
            and how it is used by reviewing the{' '}
            <a
              href="https://github.com/mission69b/audric"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:opacity-70"
            >
              source code
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-foreground text-base font-mono font-semibold mb-3">
            Contact
          </h2>
          <p>
            For privacy-related questions, reach out at{' '}
            <span className="text-foreground">security@t2000.ai</span>.
          </p>
        </section>
      </div>
    </>
  );
}
