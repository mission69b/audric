import { getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import { ConsoleHeader } from "@/components/console-header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/");
  }

  const balanceMicros = await getCreditBalanceMicros(session.user.id);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);

  return (
    <div className="min-h-dvh">
      <ConsoleHeader balance={balance} email={session.user.email} />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">{children}</main>
    </div>
  );
}
