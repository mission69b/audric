import { getCreditBalanceMicros, getUserById } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { displayHandle } from "@t2000/sdk";
import { redirect } from "next/navigation";
import { ConsoleShell } from "@/components/console-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    <ConsoleShell
      address={session.user.id}
      balance={balance}
      email={session.user.email}
      handle={handle}
    >
      {children}
    </ConsoleShell>
  );
}
