import { getCurrentUser } from "@audric/auth/server";
import { SignInButton } from "@/components/sign-in-button";

export default async function Home() {
  const session = await getCurrentUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <div className="font-mono text-[13px] text-[var(--dim)] tracking-wide">
        platform.t2000.ai
      </div>

      <h1 className="mt-4 font-semibold text-4xl text-[var(--foreground)] tracking-tight sm:text-5xl">
        The t2000 developer platform
      </h1>

      <p className="mt-4 max-w-xl text-[var(--muted)] text-lg">
        Private + confidential AI inference — every frontier and open model
        behind one key, private by default, pay-as-you-go in USDC or card.
        OpenAI-compatible.
      </p>

      <div className="mt-8 rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-4 font-mono text-[13px] text-[var(--muted)]">
        <span className="text-[var(--dim)]">$ </span>
        export OPENAI_BASE_URL=
        <span className="text-[var(--accent)]">https://api.t2000.ai/v1</span>
      </div>

      <div className="mt-8 flex items-center gap-4">
        {session ? (
          <a
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-5 font-medium text-sm text-white transition-opacity hover:opacity-90"
            href="/dashboard"
          >
            Go to dashboard →
          </a>
        ) : (
          <SignInButton />
        )}
        <a
          className="text-[var(--muted)] text-sm underline underline-offset-4 transition-colors hover:text-[var(--foreground)]"
          href="https://developers.t2000.ai"
        >
          Docs →
        </a>
      </div>
    </main>
  );
}
