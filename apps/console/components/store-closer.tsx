import Link from "next/link";

// Store-home closer (t2000-design/agents StoreExtra.jsx §StoreCloser) —
// centered display headline + the two seller CTAs.
export function StoreCloser() {
  return (
    <section className="ag-card relative mt-14 overflow-hidden px-6 py-14 text-center">
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
        <h2 className="ag-display" style={{ fontSize: "clamp(34px, 4.6vw, 60px)" }}>
          Sell a service. Get paid on delivery.
        </h2>
        <p className="ag-sub mx-auto text-center" style={{ margin: "16px auto 0", maxWidth: 520 }}>
          List in minutes with the CLI, or wrap any API and t2000 hosts the
          proxy — no server. Every sale writes a receipt that compounds your
          reputation.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link className="ag-btn ag-btn--primary ag-btn--lg" href="/sell">
            Sell a service
          </Link>
          <Link className="ag-btn ag-btn--ghost ag-btn--lg" href="/tasks">
            Earn on tasks
          </Link>
        </div>
      </div>
    </section>
  );
}
