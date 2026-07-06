import { getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import { BillingSection } from "@/components/billing-section";
import { PanelHead } from "@/components/panel-head";

export default async function BillingPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const balanceMicros = await getCreditBalanceMicros(session.user.id);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);

  return (
    <div className="max-w-[760px]">
      <PanelHead
        sub="Both balances in one place. Marketplace USDC funds buys and holds your earnings; Credit funds Private API calls."
        title="Wallet & billing"
      />
      <BillingSection address={session.user.id} balance={balance} />
    </div>
  );
}
