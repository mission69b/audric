import { getCreditBalanceMicros, getUserById } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { displayHandle } from "@t2000/sdk";
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
    redirect("/manage");
  }
  const [balanceMicros, user] = await Promise.all([
    getCreditBalanceMicros(session.user.id),
    getUserById(session.user.id),
  ]);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);
  const handle = user?.username ? displayHandle(user.username) : null;

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
            href="/manage/billing"
          >
            Add credit
          </Link>
        </Section>
        <Section>
          <div className="text-muted-foreground text-xs">Passport</div>
          <div className="mt-1 font-mono text-foreground text-sm">
            {handle ?? shortAddress(session.user.id)}
          </div>
          {handle ? (
            <div
              className="mt-0.5 font-mono text-muted-foreground text-xs"
              title={session.user.id}
            >
              {shortAddress(session.user.id)}
            </div>
          ) : null}
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
