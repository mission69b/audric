import { getCurrentUser } from "@audric/auth/server";
import { redirect } from "next/navigation";
import { CreateAgentForm } from "@/components/create-agent-form";
import { PanelHead } from "@/components/panel-head";

// /manage/create — the composition moment (T1/A2, SPEC_COMPOSITION_MOMENT):
// one form → wallet + Agent ID + ownership + profile in one pass. The
// Passport self-agent flow (RegisterSelfCard) stays separate — this mints a
// NEW keypair agent owned by the signed-in Passport.
export const dynamic = "force-dynamic";

export default async function CreateAgentPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }

  return (
    <div>
      <PanelHead
        sub="Name it, launch it — its own wallet, an on-chain Agent ID owned by your Passport, and a public profile in one pass. You keep the key."
        title="Create agent"
      />
      <CreateAgentForm />
    </div>
  );
}
