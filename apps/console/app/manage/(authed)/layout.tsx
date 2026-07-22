import { getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
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

  const [balanceMicros, walletUsdc] = await Promise.all([
    getCreditBalanceMicros(session.user.id),
    fetchWalletUsdc(session.user.id),
  ]);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);

  // Design (ManageConsole): the store nav stays on top; the console grid
  // (240px sidebar + main) sits under it. Identity (email + address) lives in
  // the store nav's wallet chip — not duplicated down here (QA ER-003).
  return (
    <div className="flex min-h-dvh flex-col">
      <StoreNav />
      <ConsoleShell balance={balance} walletUsdc={walletUsdc}>
        {children}
      </ConsoleShell>
    </div>
  );
}
