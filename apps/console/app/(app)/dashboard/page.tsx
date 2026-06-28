import { getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { QuickstartSection } from "@/components/quickstart-section";

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

export default async function OverviewPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/");
  }
  const balanceMicros = await getCreditBalanceMicros(session.user.id);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-semibold text-2xl text-[var(--foreground)] tracking-tight">
          Overview
        </h1>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Private + confidential inference — one key, pay-as-you-go.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-5">
          <div className="text-[var(--dim)] text-xs uppercase tracking-wide">
            Credit balance
          </div>
          <div className="mt-2 font-semibold text-2xl text-[var(--foreground)]">
            ${balance}
          </div>
          <Link
            className="mt-3 inline-block text-[13px] text-[var(--accent)] underline-offset-4 hover:underline"
            href="/billing"
          >
            Add credit →
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-5">
          <div className="text-[var(--dim)] text-xs uppercase tracking-wide">
            Passport
          </div>
          <div
            className="mt-2 font-mono text-[var(--foreground)] text-sm"
            title={session.user.id}
          >
            {shortAddress(session.user.id)}
          </div>
          {session.user.email ? (
            <div className="mt-1 text-[13px] text-[var(--muted)]">
              {session.user.email}
            </div>
          ) : null}
        </div>
      </div>

      <QuickstartSection />

      <p className="text-[var(--muted)] text-sm">
        Create a key in{" "}
        <Link className="text-[var(--accent)] hover:underline" href="/keys">
          API keys
        </Link>{" "}
        and drop it into the snippet above.
      </p>
    </div>
  );
}
