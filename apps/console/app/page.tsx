import { getCurrentUser } from "@audric/auth/server";
import { Lock, ShieldCheck, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Zero data retention on every model — your prompts are never stored or trained on.",
  },
  {
    icon: Lock,
    title: "Confidential tier",
    body: "GPU-TEE models with an attestation receipt — hardware-isolated inference no breadth gateway offers.",
  },
  {
    icon: Wallet,
    title: "Pay your way",
    body: "Fund with a card or USDC, pay-as-you-go per token. One balance, shared with your Audric account.",
  },
  {
    icon: Zap,
    title: "OpenAI-compatible",
    body: "Point any OpenAI SDK at api.t2000.ai/v1 — every frontier + open model behind one key.",
  },
];

export default async function Home() {
  const session = await getCurrentUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <div className="font-mono text-muted-foreground text-sm tracking-wide">
        platform.t2000.ai
      </div>

      <h1 className="mt-4 font-semibold text-4xl text-foreground tracking-tight sm:text-5xl">
        The t2000 developer platform
      </h1>

      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Private + confidential AI inference — every frontier and open model
        behind one key, private by default, pay-as-you-go in USDC or card.
        OpenAI-compatible.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-4 font-mono text-muted-foreground text-sm">
        <span className="text-muted-foreground/60">$ </span>
        export OPENAI_BASE_URL=
        <span className="text-foreground">https://api.t2000.ai/v1</span>
      </div>

      <div className="mt-8 flex items-center gap-4">
        {session ? (
          <Button asChild>
            <Link href="/dashboard">Go to dashboard →</Link>
          </Button>
        ) : (
          <SignInButton />
        )}
        <a
          className="text-muted-foreground text-sm underline underline-offset-4 transition-colors hover:text-foreground"
          href="https://developers.t2000.ai"
        >
          Docs →
        </a>
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
