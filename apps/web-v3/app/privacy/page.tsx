// TODO(legal): reasonable boilerplate reflecting how Audric actually handles
// data — NOT vetted legal text. Founder/counsel must review before public
// launch. Contact email + entity name are placeholders.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · Audric",
  description: "How Audric handles your data.",
};

const UPDATED = "June 19, 2026";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated={UPDATED}>
      <p>
        Audric is built privacy-first. This policy explains what we collect,
        why, and the controls you have. We aim to collect the minimum needed to
        run the Service.
      </p>

      <H>What we collect</H>
      <ul>
        <li>
          <strong>Account:</strong> the email address from your Google sign-in,
          and the Sui wallet address derived for you (zkLogin). We do not
          receive your Google password.
        </li>
        <li>
          <strong>Your content:</strong> chats and messages you send, and any
          artifacts you generate, so we can show your history and continue
          conversations.
        </li>
        <li>
          <strong>Memory (optional):</strong> only if you turn Private Memory
          on. Memories are encrypted and stored on Walrus; they are off by
          default.
        </li>
        <li>
          <strong>Payments:</strong> if you add credit or subscribe, Stripe
          processes your card. We store payment metadata (amounts, status, a
          reference) — <strong>never your full card number</strong>.
        </li>
        <li>
          <strong>Operational metrics:</strong> anonymized, aggregated usage
          (counts, costs, latency). We do not log prompt/response content as
          identifiable telemetry.
        </li>
      </ul>

      <H>How we use it</H>
      <p>
        To provide and improve the Service: generate responses, maintain your
        history, process payments and metered usage, keep the Service secure,
        and (only if you opt in) personalize answers via memory.
      </p>

      <H>Model providers & zero data retention</H>
      <p>
        AI requests are routed through a gateway configured for{" "}
        <strong>zero data retention by default</strong>, so prompts and
        responses are not retained by upstream model providers for training.
        Models are labeled by privacy posture in the model switcher; we never
        claim a stronger guarantee than the provider actually offers.
      </p>

      <H>Who we share with</H>
      <p>
        Service providers that operate Audric: Google (sign-in), Stripe
        (payments), our AI gateway and model providers (inference), Walrus /
        Mysten (encrypted memory storage), and our database/hosting providers.
        We do not sell your personal data.
      </p>

      <H>Retention & your controls</H>
      <p>
        You can delete individual chats, <strong>delete all chats</strong>, or{" "}
        <strong>purge all your data</strong> (chats, messages, and generated
        artifacts) from Settings. Turning Private Memory off stops recall;
        stored memories are encrypted and expire over time. On-chain
        transactions are public and permanent on the Sui blockchain by nature
        and cannot be deleted by us.
      </p>

      <H>Security</H>
      <p>
        Data is encrypted in transit and at rest. Sessions use signed, HTTP-only
        cookies. Because your wallet is non-custodial, we never hold the keys to
        your funds.
      </p>

      <H>Children</H>
      <p>
        Audric is not directed to children under 13 (or the age of digital
        consent in your region).
      </p>

      <H>Changes</H>
      <p>
        We may update this policy; the “last updated” date above reflects the
        latest version.
      </p>

      <H>Contact</H>
      <p>
        Privacy questions:{" "}
        <a href="mailto:support@audric.ai">support@audric.ai</a>.
      </p>

      <p className="mt-8 text-muted-foreground text-xs">
        See also our <Link href="/terms">Terms of Service</Link>.
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
      <div className="mt-8 space-y-3 text-foreground/80 text-sm leading-relaxed [&_a]:text-foreground [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </div>
  );
}
