import { getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import { BillingSection } from "@/components/billing-section";

export default async function BillingPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/");
  }
  const balanceMicros = await getCreditBalanceMicros(session.user.id);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);

  return <BillingSection balance={balance} />;
}
