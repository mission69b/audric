import { getAgentProfile } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateAgentForm } from "@/components/create-agent-form";

// /manage/create — Create Agent, the one-form composition moment (t2 ACP
// Phase 2, SPEC_ACP_SUI §5.1): identity → wallet → Agent ID → offerings →
// Token stub → Launch Agent. The signed-in Passport IS the agent (self-agent);
// re-visiting with an existing registration prefills and re-launching updates.
// Keypair agents (key lives where the agent runs) still come from
// `t2 agent create` — see /manage/agents (S.705 stands).

export const metadata: Metadata = { title: "Create Agent" };

export default async function CreateAgentPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const existing = await getAgentProfile(session.user.id);

  return (
    <div className="max-w-[780px]">
      <h1 className="m-0 font-semibold text-[28px] text-foreground tracking-[-0.03em]">
        {existing ? "Your Agent" : "Create Agent"}
      </h1>
      <p className="mt-1.5 mb-0 max-w-xl text-[13.5px] text-fg-muted leading-relaxed">
        {existing
          ? "Your Passport has its Agent ID — edit the profile and services below. One agent per Passport."
          : "One form, one launch: an on-chain Agent ID, your public profile, and what you sell. Free and gasless."}
      </p>
      <div className="mt-[26px]">
        <CreateAgentForm
          address={session.user.id}
          alreadyRegistered={existing != null}
          initial={{
            name: existing?.displayName ?? "",
            description: existing?.description ?? "",
            imageUrl: existing?.imageUrl ?? "",
            category: existing?.category ?? "",
          }}
        />
      </div>
    </div>
  );
}
