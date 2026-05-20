/**
 * `/chat` layout — chrome-free pass-through (post-S.209).
 *
 * Pre-S.209 this layout wrapped children with `<SidebarProvider> +
 * <AppSidebar /> + <SidebarInset>`. That meant the sidebar — and every
 * client component inside it (SidebarHistory, SidebarUserNav, etc) —
 * mounted on EVERY /chat visit, including unauth visits during the
 * pre-auth splash. That caused two problems:
 *
 *   1. UX: the founder saw a sidebar + empty "Your conversations will
 *      appear here..." text behind the pre-auth hero ("Your money,
 *      handled."). The sidebar shouldn't render until the user is
 *      signed in.
 *
 *   2. Console errors: SidebarUserNav fires `useUserStatus()` which
 *      hits `/api/user/status?address=...` with the (possibly stale)
 *      JWT from localStorage. On expired sessions this 401s. Same for
 *      SidebarHistory → /api/history. Neither call should happen until
 *      the JWT is verified-fresh.
 *
 * Fix: layout becomes a pure Suspense wrapper. AudricChatClient
 * controls its own chrome — wraps the authenticated branch with
 * `<SidebarProvider> + <AppSidebar /> + <SidebarInset>`, leaves the
 * loading / pre-auth / expired-session splash branches chrome-less.
 *
 * Pre-S.209 sidebar_state cookie SSR read is dropped — the cookie still
 * gets written/read on toggle (shadcn SidebarProvider does it
 * client-side via document.cookie); we accept defaulting to "open" on
 * cold load (one click to collapse, trivial UX cost) in exchange for
 * solving the unauth-chrome bug structurally.
 */

import { Suspense } from "react";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh bg-background" />}>
      {children}
    </Suspense>
  );
}
