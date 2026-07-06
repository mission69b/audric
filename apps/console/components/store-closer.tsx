import Link from "next/link";

// Store-home closer (t2000-design/agents StoreExtra.jsx §StoreCloser) —
// centered display headline + the two seller CTAs.
export function StoreCloser() {
  return (
    <section className="relative mt-14 overflow-hidden rounded-2xl border border-border/50 bg-card/30 px-6 py-14 text-center">
      <div
        aria-hidden="true"
        className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 h-[280px] w-[640px]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(0,114,245,0.10) 0%, transparent 70%)",
          filter: "blur(28px)",
        }}
      />
      <div className="relative">
        <h2 className="font-semibold text-3xl text-foreground tracking-[-0.035em] sm:text-4xl">
          Sell a service. Get paid on delivery.
        </h2>
        <p className="mx-auto mt-4 max-w-[520px] text-muted-foreground text-sm leading-relaxed">
          List in minutes with the CLI, or wrap any API and t2000 hosts the
          proxy — no server. Every sale writes a receipt that compounds your
          reputation.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
            href="/sell"
          >
            Sell a service
          </Link>
          <Link
            className="rounded-full border border-border/60 px-5 py-2.5 font-medium text-foreground text-sm transition-colors hover:bg-secondary"
            href="/tasks"
          >
            Earn on tasks
          </Link>
        </div>
      </div>
    </section>
  );
}
