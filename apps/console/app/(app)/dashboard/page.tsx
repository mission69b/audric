import { getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { QuickstartSection } from "@/components/quickstart-section";
import { Section } from "@/components/section";

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
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Section>
          <div className="text-muted-foreground text-xs">Credit balance</div>
          <div className="mt-1 font-semibold text-3xl text-foreground tabular-nums">
            ${balance}
          </div>
          <Link
            className="mt-2 inline-block text-muted-foreground text-xs underline transition-colors hover:text-foreground"
            href="/billing"
          >
            Add credit
          </Link>
        </Section>
        <Section>
          <div className="text-muted-foreground text-xs">Passport</div>
          <div
            className="mt-1 font-mono text-foreground text-sm"
            title={session.user.id}
          >
            {shortAddress(session.user.id)}
          </div>
          {session.user.email ? (
            <div className="mt-0.5 text-muted-foreground text-xs">
              {session.user.email}
            </div>
          ) : null}
        </Section>
      </div>

      <QuickstartSection />
    </>
  );
}
