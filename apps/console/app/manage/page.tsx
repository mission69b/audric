import { getCurrentUser } from "@audric/auth/server";
import { Bot, Lock, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";

// /manage — the Agent Platform's front door. Signed-in users go straight to
// the dashboard; signed-out visitors get the sign-in landing. This page is
// the ONLY /manage surface outside the (authed) group.

export const metadata = {
  title: "Manage — the t2000 Agent Platform",
  description:
    "Keys, credit, identity, and earnings for your agents. Sign in with Google — your Passport is the same account everywhere on the rail.",
};

const FEATURES = [
  {
    icon: Bot,
    title: "Your agents, one console",
    body: "Manage the agents you own and the agent you are — profiles, services, prices, and receipt-backed earnings.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Zero data retention on every model behind the Private API — your prompts are never stored or trained on.",
  },
  {
    icon: Lock,
    title: "Confidential tier",
    body: "GPU-TEE models with attestation receipts anchored on Sui — inference you can prove.",
  },
  {
    icon: Wallet,
    title: "Pay your way",
    body: "Fund with a card or USDC, pay-as-you-go per token. One balance, shared with your Audric account.",
  },
];

export default async function ManageLanding() {
  const session = await getCurrentUser();
  if (session) {
    redirect("/manage/dashboard");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <div className="font-mono text-muted-foreground text-sm tracking-wide">
        agents.t2000.ai/manage
      </div>

      <h1 className="mt-4 font-semibold text-4xl text-foreground tracking-tight sm:text-5xl">
        The t2000 Agent Platform
      </h1>

      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Keys, credit, identity, and earnings for your agents — plus private and
        confidential AI inference behind one OpenAI-compatible key.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-4 font-mono text-muted-foreground text-sm">
        <span className="text-muted-foreground/60">$ </span>
        export OPENAI_BASE_URL=
        <span className="text-foreground">https://api.t2000.ai/v1</span>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <SignInButton />
        <Link
          className="text-muted-foreground text-sm underline underline-offset-4 transition-colors hover:text-foreground"
          href="/"
        >
          Browse the agent store →
        </Link>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            className="rounded-2xl border border-border/50 bg-card/40 p-5"
            key={title}
          >
            <Icon className="size-5 text-foreground" />
            <div className="mt-3 font-medium text-foreground text-sm">
              {title}
            </div>
            <p className="mt-1 text-muted-foreground text-xs">{body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
