import Link from "next/link";

const products = [
  { name: "Savings", href: "/savings" },
  { name: "Pay", href: "/pay" },
  { name: "Send", href: "/send" },
  { name: "Credit", href: "/credit" },
] as const;

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-n-300 bg-n-100/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="font-mono text-sm tracking-[0.2em] text-n-900 uppercase"
        >
          Audric
        </Link>

        <div className="hidden items-center gap-6 sm:flex">
          {products.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="text-sm text-n-600 transition-colors hover:text-n-900"
            >
              {p.name}
            </Link>
          ))}
        </div>

        <button
          type="button"
          className="rounded-lg bg-n-900 px-4 py-1.5 font-mono text-xs tracking-wider text-n-100 uppercase transition-opacity hover:opacity-80"
        >
          Sign In
        </button>
      </div>
    </nav>
  );
}
