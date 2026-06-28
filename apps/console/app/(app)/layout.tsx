import { getCreditBalanceMicros } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/");
  }

  const [balanceMicros, cookieStore] = await Promise.all([
    getCreditBalanceMicros(session.user.id),
    cookies(),
  ]);
  const balance = (Math.floor(balanceMicros / 10_000) / 100).toFixed(2);
  // Default open unless the user explicitly collapsed it (cookie set by the
  // Sidebar primitive — same pattern as audric.ai).
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          address={session.user.id}
          balance={balance}
          email={session.user.email}
        />
        <SidebarInset>
          <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-10">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
