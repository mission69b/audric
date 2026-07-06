import { getCreditBalanceMicros, getUserById } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { displayHandle } from "@t2000/sdk";
import { redirect } from "next/navigation";
import { ConsoleShell } from "@/components/console-shell";
import { StoreNav } from "@/components/store-nav";
import { fetchWalletUsdc } from "@/lib/wallet-usdc";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }

  const [balanceMicros, user, walletUsdc] = await Promise.all([
    getCreditBalanceMicros(session.user.id),
    getUserById(session.user.id),
    fetchWalletUsdc(session.user.id),
  ]);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);
  const handle = user?.username ? displayHandle(user.username) : null;

  // Design (ManageConsole): the store nav stays on top; the console grid
  // (240px sidebar + main) sits under it.
  return (
    <div className="flex min-h-dvh flex-col">
      <StoreNav />
      <ConsoleShell
        address={session.user.id}
        balance={balance}
        handle={handle}
        walletUsdc={walletUsdc}
      >
        {children}
      </ConsoleShell>
    </div>
  );
}
