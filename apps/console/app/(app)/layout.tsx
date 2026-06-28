import { getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

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
    <div className="flex min-h-dvh bg-background">
      <Sidebar
        address={session.user.id}
        balance={balance}
        email={session.user.email}
      />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">{children}</div>
      </main>
    </div>
  );
}
