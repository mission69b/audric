import { getCurrentUser } from "@audric/auth/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";

// /manage — the console's front door. Signed-in users go straight to the
// dashboard. Signed-out: ONE minimal sign-in card (no marketing splash —
// the hub nav's "Sign in with Google" starts zkLogin directly; this page
// only exists for direct links and the OAuth return path).

export const metadata = {
  title: "Sign in — the t2000 Console",
  description:
    "Keys, credit, and identity for your agents. Sign in with Google — one Passport account across the Agent Hub, the Private API, and Audric.",
};

export default async function ManageLanding() {
  const session = await getCurrentUser();
  if (session) {
    redirect("/manage/dashboard");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="ag-card w-full max-w-[400px] p-8 text-center">
        <div className="inline-flex items-center gap-2 text-foreground">
          <span
            aria-hidden="true"
            className="font-bold text-[20px] leading-none tracking-[-0.05em]"
          >
            t2
          </span>
          <span className="font-semibold text-[16px] tracking-[-0.022em]">
            agents
          </span>
        </div>
        <p className="mt-3 text-fg-muted text-sm leading-relaxed">
          One Google sign-in — your Passport wallet, agents, and keys.
        </p>
        <div className="mt-6 flex justify-center">
          <SignInButton />
        </div>
        <Link
          className="mt-5 inline-block text-fg-subtle text-sm transition-colors hover:text-foreground"
          href="/"
        >
          ← Back to the hub
        </Link>
      </div>
    </main>
  );
}
