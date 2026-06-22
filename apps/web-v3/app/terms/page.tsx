// TODO(legal): reasonable boilerplate reflecting how Audric actually works —
// NOT vetted legal text. Counsel should review before relying on it.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service · Audric",
  description: "The terms governing your use of Audric.",
};

const UPDATED = "June 22, 2026";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated={UPDATED}>
      <p>
        Welcome to Audric. Audric (the “Service”) is operated by{" "}
        <strong>T2000 AFI Inc.</strong> By accessing or using the Service, you
        agree to these Terms of Service. If you do not agree, do not use the
        Service.
      </p>

      <H>1. What Audric is</H>
      <p>
        Audric is an AI assistant paired with a non-custodial wallet on the Sui
        network. You sign in with Google, and a self-custodial wallet is derived
        for you (zkLogin). <strong>Audric is non-custodial:</strong> we cannot
        access, move, or freeze your funds, and every on-chain action (sending
        USDC, paying for a Recipe, etc.) requires your explicit confirmation.
      </p>

      <H>2. Not financial advice</H>
      <p>
        Audric is an informational and productivity tool. Nothing it generates
        is financial, investment, legal, or tax advice. AI output can be
        inaccurate or incomplete. You are solely responsible for any decisions
        you make and any transactions you confirm.
      </p>

      <H>3. Your account & wallet</H>
      <p>
        You are responsible for maintaining the security of the Google account
        you use to sign in. Because the wallet is non-custodial, access is tied
        to your authentication — we cannot recover funds on your behalf. You
        must be able to form a binding contract to use the Service.
      </p>

      <H>4. Audric credit (closed-loop)</H>
      <p>
        “Audric credit” is closed-loop, prepaid value used only within Audric to
        pay for premium AI usage and subscription features. Audric credit is{" "}
        <strong>non-refundable, non-withdrawable, and non-transferable</strong>,
        has no cash value, and cannot be redeemed for currency. You accept these
        terms when you first add credit.
      </p>

      <H>5. Payments & subscriptions</H>
      <p>
        Card payments are processed by Stripe; we do not store your full card
        details. Subscriptions renew automatically each billing period until you
        cancel. Cancellation stops future renewals; it does not refund the
        current period or unused credit.
      </p>

      <H>6. Acceptable use</H>
      <p>
        Do not use Audric to break the law, infringe others’ rights, generate
        harmful or abusive content, or attempt to disrupt, reverse-engineer, or
        gain unauthorized access to the Service. We may suspend access for
        violations.
      </p>

      <H>7. Content</H>
      <p>
        You retain rights to the content you submit. Use of AI output is subject
        to the underlying model providers’ terms, and you are responsible for
        how you use it. You grant us the limited rights needed to operate the
        Service (e.g., processing your prompts to generate responses).
      </p>

      <H>8. Disclaimers & limitation of liability</H>
      <p>
        The Service is provided “as is,” without warranties of any kind. To the
        maximum extent permitted by law, Audric is not liable for indirect,
        incidental, or consequential damages, or for losses arising from your
        use of AI output, on-chain transactions you confirm, or third-party
        services.
      </p>

      <H>9. Changes</H>
      <p>
        We may update these Terms. Material changes will be reflected by the
        “last updated” date above; continued use after changes means you accept
        them.
      </p>

      <H>10. Contact</H>
      <p>
        Questions about these Terms:{" "}
        <a href="mailto:hello@audric.ai">hello@audric.ai</a>.
      </p>

      <p className="mt-8 text-muted-foreground text-xs">
        See also our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalLayout>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-2 font-semibold text-foreground text-lg">
      {children}
    </h2>
  );
}

function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-12">
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Back to Audric
      </Link>
      <h1 className="mt-6 font-semibold text-3xl text-foreground">{title}</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        Last updated {updated}
      </p>
      <div className="mt-8 space-y-3 text-foreground/80 text-sm leading-relaxed [&_a]:text-foreground [&_a]:underline">
        {children}
      </div>
    </div>
  );
}
