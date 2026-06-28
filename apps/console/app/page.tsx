import { getCurrentUser } from "@audric/auth/server";
import Link from "next/link";
import { SignInButton } from "@/components/sign-in-button";
import { Button } from "@/components/ui";

export default async function Home() {
  const session = await getCurrentUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
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
        <span className="text-accent">https://api.t2000.ai/v1</span>
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
    </main>
  );
}
