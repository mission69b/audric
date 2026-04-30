import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Audric — Disclaimer',
  description: 'Risk disclaimer for the Audric AI financial assistant.',
};

export default function DisclaimerPage() {
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
          Disclaimer
        </h1>
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">Last updated · April 2026</p>
      </header>

      <div className="space-y-10 text-fg-secondary leading-[1.7] text-[14px]">
        <div className="bg-fg-primary/5 border border-border-subtle rounded-lg p-4 text-fg-primary/80">
          <strong className="text-fg-primary">Audric is beta software.</strong>{' '}
          This software is provided &quot;as is&quot; without warranty of any
          kind. Use at your own risk.
        </div>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Risk of Loss
          </h2>
          <p>
            Interacting with blockchain protocols and DeFi applications involves
            substantial risk of loss. You could lose some or all of your funds
            due to smart contract bugs, protocol exploits, oracle failures,
            liquidation events, or other unforeseen circumstances.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Smart Contract Risk
          </h2>
          <p>
            Audric interacts with third-party smart contracts on the Sui
            blockchain (NAVI Protocol, Cetus, VOLO, and others). These contracts
            have been audited by their respective teams but are not guaranteed to
            be free of vulnerabilities. Audric does not audit or guarantee the
            safety of any third-party protocol.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            No Guarantee of Returns
          </h2>
          <p>
            APY rates displayed are variable and based on real-time protocol
            data. They can change at any time and are not guaranteed. Past
            performance does not indicate future results.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            AI Assistant Accuracy
          </h2>
          <p>
            The AI assistant is powered by large language models that can produce
            incorrect, incomplete, or misleading information. This includes but
            is not limited to:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>Yield comparisons and rebalancing recommendations</li>
            <li>Risk assessments and health factor analysis</li>
            <li>Swap estimates and price quotes</li>
            <li>Tax or regulatory interpretations</li>
          </ul>
          <p className="mt-2">
            Always verify critical financial information independently before
            making decisions. The AI confirms actions before executing them, but
            you bear full responsibility for approving transactions.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Authentication and Key Management
          </h2>
          <p>
            Audric uses zkLogin via Google sign-in, powered by Mysten Labs
            Enoki. Your wallet is derived from your Google session. If you lose
            access to your Google account, you may lose access to your wallet.
            Audric cannot recover funds on your behalf.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Tax Implications
          </h2>
          <p>
            Using cryptocurrency (including stablecoins like USDC) to swap,
            send, or interact with DeFi protocols may constitute a taxable event
            in your jurisdiction. Audric does not provide tax advice, does not
            generate tax reports, and does not report transactions to tax
            authorities. Consult a qualified tax professional regarding your
            obligations.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Regulatory
          </h2>
          <p>
            Audric does not provide financial services and is not a bank,
            custodian, exchange, or financial advisor. The use of terms like
            &quot;savings,&quot; &quot;wallet,&quot; and &quot;debt&quot; are
            functional labels within the app and describe interactions with DeFi
            protocols, not traditional banking products. Deposits are not
            insured. Users are responsible for understanding and complying with
            the laws and regulations in their jurisdiction.
          </p>
        </section>

        <section>
          <h2 className="text-fg-primary font-mono text-[10px] tracking-[0.12em] uppercase mb-4">
            Beta Software
          </h2>
          <p>
            Audric is currently in active development. Features may change,
            break, or be removed without notice. The software has not undergone
            a formal third-party security audit. An internal security review of
            the underlying t2000 infrastructure has been completed and is{' '}
            <a
              href="https://github.com/mission69b/t2000/blob/main/SECURITY_AUDIT.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-primary underline underline-offset-2 hover:opacity-70"
            >
              publicly available
            </a>
            .
          </p>
        </section>
      </div>
    </>
  );
}
