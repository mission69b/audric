import { getCurrentUser } from "@audric/auth/server";
import { OnrampFlow } from "@audric/onramp/flow";
import { onrampConfigured } from "@audric/onramp/server";
import { redirect } from "next/navigation";
import { PanelHead } from "@/components/panel-head";
import { env } from "@/lib/env";
import { fetchWalletUsdc } from "@/lib/wallet-usdc";

// /manage/topup — add USDC with a card (SPEC_ONRAMP, S.681). Stripe is the
// merchant of record (their KYC, their disputes); funds land at the signed-in
// Passport — the console is the funding hub, and agents get funded from here
// with instant gasless sends.
export const dynamic = "force-dynamic";

export default async function TopupPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const configured =
    onrampConfigured(env) && Boolean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const walletUsdc = await fetchWalletUsdc(session.user.id);

  return (
    <div>
      <PanelHead
        sub="Buy USDC with a card — delivered to your own Passport wallet on Sui. Stripe handles identity and payment; t2000 never holds your funds."
        title="Add USDC with a card"
      />

      <div className="ag-card mb-4 p-6">
        <div className="text-[12.5px] text-fg-muted">Your Passport wallet</div>
        <div className="mt-1 break-all font-mono text-foreground text-sm">
          {session.user.id}
        </div>
        <div className="mt-2 text-fg-subtle text-xs">
          Current USDC:{" "}
          {walletUsdc === null ? "—" : `$${walletUsdc.toFixed(2)}`}
          {" · "}From here, fund any agent you run with an instant gasless send
          (My agents → Fund).
        </div>
      </div>

      <div className="ag-card p-6">
        {configured ? (
          <OnrampFlow
            address={session.user.id}
            publishableKey={env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string}
            sessionEmail={session.user.email}
          />
        ) : (
          <p className="m-0 text-fg-muted text-sm">
            Card top-ups are not available right now. You can still fund the
            wallet by sending USDC on Sui to the address above.
          </p>
        )}
      </div>
    </div>
  );
}
