import { getCreditBalanceMicros, getUserById } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import { ApiKeysSection } from "@/components/api-keys-section";
import { BillingSection } from "@/components/billing-section";
import { PlansSection } from "@/components/plans-section";
import { SignOutButton } from "@/components/sign-out-button";

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

export default async function DashboardPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/");
  }

  const [balanceMicros, user] = await Promise.all([
    getCreditBalanceMicros(session.user.id),
    getUserById(session.user.id),
  ]);
  // Floor to 2dp — never display more credit than the ledger holds.
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);
  const currentTier = user?.subscriptionTier ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-16">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[13px] text-[var(--dim)] tracking-wide">
          platform.t2000.ai
        </div>
        <SignOutButton />
      </div>

      <h1 className="mt-8 font-semibold text-3xl text-[var(--foreground)] tracking-tight">
        Dashboard
      </h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-5">
          <div className="text-[var(--dim)] text-xs uppercase tracking-wide">
            Credit balance
          </div>
          <div className="mt-2 font-semibold text-2xl text-[var(--foreground)]">
            ${balance}
          </div>
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
            <div className="mt-1 text-[var(--muted)] text-sm">
              {session.user.email}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        <BillingSection />
      </div>

      <div className="mt-8">
        <PlansSection currentTier={currentTier} />
      </div>

      <div className="mt-8">
        <ApiKeysSection />
      </div>
    </main>
  );
}
