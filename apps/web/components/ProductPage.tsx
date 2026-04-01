import Link from "next/link";

interface Stat {
  label: string;
  value: string;
}

interface Step {
  number: string;
  title: string;
  description: string;
}

interface ProductPageProps {
  badge: string;
  title: string;
  subtitle: string;
  stats: Stat[];
  steps: Step[];
  cta: string;
  ctaPrompt: string;
  status?: "live" | "coming-soon";
}

export function ProductPage({
  badge,
  title,
  subtitle,
  stats,
  steps,
  cta,
  ctaPrompt,
  status = "live",
}: ProductPageProps) {
  return (
    <main className="flex-1 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-n-500 transition-colors hover:text-n-700"
        >
          <span aria-hidden="true">&larr;</span>
          Back to chat
        </Link>

        <header className="mt-10 space-y-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tracking-widest text-n-500 uppercase">
              {badge}
            </span>
            {status === "coming-soon" && (
              <span className="rounded-full bg-yellow-200 px-2 py-0.5 font-mono text-[10px] tracking-wider text-yellow-700 uppercase">
                Coming soon
              </span>
            )}
          </div>
          <h1 className="text-4xl tracking-tight sm:text-5xl">{title}</h1>
          <p className="text-lg text-n-600">{subtitle}</p>
        </header>

        {stats.length > 0 && (
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-n-300 p-4 shadow-card"
              >
                <p className="text-2xl font-medium text-n-900">{stat.value}</p>
                <p className="mt-1 font-mono text-[11px] tracking-wider text-n-500 uppercase">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        )}

        <section className="mt-16">
          <h2 className="text-2xl">How it works</h2>
          <div className="mt-8 space-y-6">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-n-300 font-mono text-xs text-n-600">
                  {step.number}
                </div>
                <div>
                  <p className="font-medium text-n-900">{step.title}</p>
                  <p className="mt-1 text-sm text-n-600">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-16">
          <Link
            href={`/?prompt=${encodeURIComponent(ctaPrompt)}`}
            className="inline-flex items-center gap-2 rounded-xl bg-n-900 px-6 py-3 font-mono text-xs tracking-wider text-n-100 uppercase transition-opacity hover:opacity-80"
          >
            {cta}
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        <footer className="mt-24 border-t border-n-300 pt-6 text-xs text-n-500">
          <p>
            Built with{" "}
            <span className="font-mono tracking-wider uppercase">t2000</span>{" "}
            infrastructure. Non-custodial. You approve every transaction.
          </p>
        </footer>
      </div>
    </main>
  );
}
