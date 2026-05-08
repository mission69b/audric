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
          className="inline-block text-fg-secondary hover:text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-8 transition-colors"
        >
          &larr; audric.ai
        </Link>
        <h1 className="font-serif text-[36px] sm:text-[44px] leading-[1.1] tracking-[-0.01em] text-fg-primary mb-3">
          Privacy Policy
        </h1>
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">Last updated · May 2026</p>
      </header>

      <div className="space-y-10 text-fg-secondary leading-[1.7] text-[14px]">
        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Overview
          </h2>
          <p>
            Audric is designed with privacy as a core principle. We collect
            minimal data, operate non-custodially, and never store your private
            keys. This policy covers the Audric web app at audric.ai &mdash;
            including Audric Passport (identity + wallet), Audric Intelligence
            (the agent), Audric Finance (save / borrow / swap), and Audric Pay
            (send / receive). It explains what we collect, why we collect it,
            and what we never collect.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            What We Collect
          </h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-fg-primary">Email address</strong> &mdash;
              Collected via Google sign-in (zkLogin) for authentication. Used
              to derive your wallet address.
            </li>
            <li>
              <strong className="text-fg-primary">Sui wallet address</strong>{' '}
              &mdash; Generated via zkLogin (Mysten Labs Enoki). This is a
              public blockchain address derived from your Google session.
            </li>
            <li>
              <strong className="text-fg-primary">Audric username</strong>{' '}
              &mdash; The handle you claim during onboarding (e.g.{' '}
              <code className="font-mono text-[12px] text-fg-primary">
                you@audric
              </code>
              ). Stored in our database, linked to your wallet address. Used
              as the public-facing identity layer of your Passport.
            </li>
            <li>
              <strong className="text-fg-primary">Chat messages</strong> &mdash;
              Sent to Anthropic&apos;s API for AI processing during your session,
              and stored in our database to power conversation history and
              context across turns. Subject to{' '}
              <a
                href="https://www.anthropic.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg-primary underline underline-offset-2 hover:opacity-70"
              >
                Anthropic&apos;s privacy policy
              </a>
              .
            </li>
            <li>
              <strong className="text-fg-primary">Transaction digests</strong>{' '}
              &mdash; On-chain transaction IDs for the actions you confirm
              (saves, sends, swaps, borrows, repayments). Recorded for receipt
              tracking and history. These are public blockchain data.
            </li>
            <li>
              <strong className="text-fg-primary">
                Financial context snapshots
              </strong>{' '}
              &mdash; Once a day we read your on-chain wallet, savings,
              borrows, health factor, and recent activity, and store a
              snapshot. This lets Audric answer questions about your money
              without re-querying the chain on every turn.
            </li>
            <li>
              <strong className="text-fg-primary">Inferred profile + memory</strong>{' '}
              &mdash; Audric Intelligence builds a private profile from your
              chat history (preferences, risk tolerance, what you&apos;ve told
              the agent) and stores classified facts about your on-chain
              activity (recurring sends, idle balances, position changes).
              Used silently to make answers more relevant. Never surfaced as a
              notification, never shared, never sold.
            </li>
            <li>
              <strong className="text-fg-primary">Advice log</strong> &mdash;
              Recommendations Audric has made are stored so the agent
              doesn&apos;t contradict itself across sessions. Visible only to
              you and the agent.
            </li>
            <li>
              <strong className="text-fg-primary">Saved contacts</strong> &mdash;
              Contact names and Sui addresses you save are stored in our
              database linked to your wallet address for convenience.
            </li>
            <li>
              <strong className="text-fg-primary">
                Timezone and browser locale
              </strong>{' '}
              &mdash; Used to format dates, times, and currency for your
              region. Not stored permanently.
            </li>
            <li>
              <strong className="text-fg-primary">
                Aggregate usage metrics
              </strong>{' '}
              &mdash; Anonymous counters of operations (saves, swaps, sends)
              for the public stats dashboard. No individual user data is
              exposed.
            </li>
            <li>
              <strong className="text-fg-primary">Website analytics</strong>{' '}
              &mdash; We use{' '}
              <a
                href="https://vercel.com/analytics"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg-primary underline underline-offset-2 hover:opacity-70"
              >
                Vercel Analytics
              </a>{' '}
              for anonymous, cookieless page view analytics.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            How Audric Intelligence Uses Your Data
          </h2>
          <p>
            Audric Intelligence is the agent that powers your Passport. It
            uses your stored data (chat history, financial context snapshot,
            inferred profile, chain memory, advice log) silently &mdash; only
            ever as context that shapes the agent&apos;s next reply or
            executes the next action you confirm.
          </p>
          <p className="mt-2">
            <strong className="text-fg-primary">It does not:</strong> sell
            your data, share it with advertisers, build a profile for any
            third party, surface unsolicited notifications based on it, or
            execute any action without your tap-to-confirm via Passport.
          </p>
          <p className="mt-2">
            You can request deletion of your stored profile, memory, and
            advice log at any time by emailing{' '}
            <span className="text-fg-primary">security@t2000.ai</span>.
            Deleting your account removes all of it.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
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
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Data Shared with Third Parties
          </h2>
          <p>
            When you use Audric, certain data is shared with upstream providers
            to fulfill your request. We do not sell or transfer data for
            advertising or profiling purposes.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong className="text-fg-primary">Anthropic</strong> &mdash; Chat
              messages for AI processing
            </li>
            <li>
              <strong className="text-fg-primary">Mysten Labs (Enoki)</strong>{' '}
              &mdash; Authentication and gas sponsorship
            </li>
            <li>
              <strong className="text-fg-primary">Google</strong> &mdash; OAuth
              sign-in via zkLogin
            </li>
            <li>
              <strong className="text-fg-primary">BlockVision</strong> &mdash;
              Read-only wallet + portfolio queries (Indexer REST API + token
              prices)
            </li>
            <li>
              <strong className="text-fg-primary">DeFi protocols</strong> (NAVI,
              Cetus, VOLO) &mdash; Via on-chain smart contracts (public
              blockchain data only)
            </li>
            <li>
              <strong className="text-fg-primary">Sui RPC nodes</strong> &mdash;
              For blockchain interaction
            </li>
            <li>
              <strong className="text-fg-primary">Vercel</strong> &mdash; App
              hosting and analytics
            </li>
            <li>
              <strong className="text-fg-primary">Neon</strong> &mdash;
              PostgreSQL database hosting
            </li>
            <li>
              <strong className="text-fg-primary">Upstash</strong> &mdash; Redis
              session and cache hosting
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Data Storage
          </h2>
          <p>
            Profile data (username, wallet address, saved contacts, chat
            history, inferred profile, chain memory, advice log, daily
            financial context snapshots, transaction history) is stored in a
            PostgreSQL database hosted on Neon. Session data and short-lived
            caches are stored in Redis (Upstash) and expire automatically.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
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
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Open Source
          </h2>
          <p>
            Audric is open source. You can verify exactly what data is collected
            and how it is used by reviewing the{' '}
            <a
              href="https://github.com/mission69b/audric"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-primary underline underline-offset-2 hover:opacity-70"
            >
              source code
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Contact
          </h2>
          <p>
            For privacy-related questions, reach out at{' '}
            <span className="text-fg-primary">security@t2000.ai</span>.
          </p>
        </section>
      </div>
    </>
  );
}
