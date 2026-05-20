import { cookies } from "next/headers";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { ChatGate } from "@/components/chat/chat-gate";
import { DataStreamProvider } from "@/components/chat/data-stream-provider";
import { UsernamePaletteRoot } from "@/components/chat/username-palette-root";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ActiveChatProvider } from "@/hooks/use-active-chat";
import { getCurrentUser } from "@/lib/audric-auth";

// [v0.7c Session 5.5] Pyodide CDN <Script> removed — the template
// loaded a 10MB+ Python-in-browser runtime from jsdelivr for its
// code-artifact execution feature, which Audric does not use. The
// whole (chat) route group deletes in Session 9a; this removal is the
// last brand/perf surface remaining at root.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DataStreamProvider>
      <Suspense fallback={<div className="flex h-dvh bg-sidebar" />}>
        <SidebarShell>{children}</SidebarShell>
      </Suspense>
    </DataStreamProvider>
  );
}

async function SidebarShell({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([
    getCurrentUser(),
    cookies(),
  ]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <AppSidebar user={session?.user} />
      <SidebarInset>
        <Toaster
          position="top-center"
          theme="system"
          toastOptions={{
            className:
              "!bg-card !text-foreground !border-border/50 !shadow-[var(--shadow-float)]",
          }}
        />
        <Suspense fallback={<div className="flex h-dvh" />}>
          <ActiveChatProvider>
            <ChatGate />
            <UsernamePaletteRoot />
          </ActiveChatProvider>
        </Suspense>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
