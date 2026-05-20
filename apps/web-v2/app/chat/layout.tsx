/**
 * `/chat` layout — Audric chat chrome (sidebar + inset).
 *
 * Wraps `app/chat/page.tsx` with the SidebarProvider + AppSidebar +
 * SidebarInset shell so the authenticated chat surface gets the
 * polished perplexity-style chrome (brand mark + new-chat nav + wallet
 * sign-out in sidebar; trigger + composer + chips in the inset).
 *
 * Identity flow:
 *   - This layout is a SERVER component (Next.js App Router default).
 *     Audric uses zkLogin where the session blob lives in localStorage
 *     CLIENT-side, so there's no httpOnly cookie for the server to read.
 *   - We therefore DON'T fetch a server-side session here — it would
 *     always be null. Identity is sourced from `useZkLogin()` inside
 *     `<AppSidebar />`'s `<SidebarUserNav />` footer (client-only),
 *     which renders the wallet pill + sign-out dropdown once the
 *     localStorage session hydrates.
 *
 * Sidebar default-open state is persisted via the `sidebar_state` cookie
 * (set by the shadcn SidebarProvider on user toggle). We read it
 * server-side so the SSR + first-client renders agree on the open/
 * collapsed state — eliminates the layout-shift flash that the
 * client-only fallback would produce.
 *
 * Toaster mounts inside the inset (not at the root layout) so toast
 * positioning anchors to the chat surface and respects the chat
 * theme tokens rather than the global app theme.
 *
 * [S.203 — 2026-05-20] Refactored from AudricSidebar (a near-duplicate
 * of AppSidebar I added in S.202) to use AppSidebar directly. The
 * "don't reinvent the wheel" feedback re-routed identity sourcing into
 * the existing template primitive — `SidebarUserNav` is now wallet-
 * aware and AppSidebar is its single consumer. See S.203 entry in
 * `audric-build-tracker.md` for the deduplication rationale.
 */

import { cookies } from "next/headers";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Wrap the SidebarShell in Suspense so Next.js 16's Cache Components
  // prerender can stream the dynamic `cookies()` read inside it without
  // blocking the static prerender of the rest of the route. Mirrors the
  // `(chat)/layout.tsx` pattern (server-component layout + Suspense-
  // wrapped child that calls cookies()) from the template.
  return (
    <Suspense fallback={<div className="flex h-dvh bg-sidebar" />}>
      <SidebarShell>{children}</SidebarShell>
    </Suspense>
  );
}

async function SidebarShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <AppSidebar />
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
          {children}
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  );
}
