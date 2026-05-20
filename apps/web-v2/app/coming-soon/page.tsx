/**
 * /coming-soon — placeholder destination for sidebar nav items
 * that don't have a real surface in web-v2 yet.
 *
 * Per the S.204+ "panel strategy" decision (Option A — stub_soon):
 * Portfolio / Activity / Pay / Store all route here. Settings + Contacts
 * have real routes (`/settings`, `/settings/contacts`) and bypass this
 * page entirely. The Audric design system's voice is direct, so the
 * copy says exactly what the user should do instead (try Charts in
 * chat) — no hedge language, no roadmap teasers.
 *
 * If/when a real Portfolio / Activity / Pay / Store surface ships,
 * its sidebar item gets its own href and this page becomes orphaned.
 * That's the canary signal to delete it.
 */

import Link from "next/link";

export default function ComingSoonPage() {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center bg-surface-page px-6 text-center">
      <div className="w-full max-w-md space-y-6">
        <p className="font-mono text-[10px] text-fg-muted uppercase tracking-[0.16em]">
          Coming soon
        </p>
        <h1 className="font-serif text-[40px] text-fg-primary leading-[1.1] tracking-[-0.02em]">
          We&apos;re rebuilding this surface
        </h1>
        <p className="text-[14px] text-fg-secondary leading-relaxed">
          For now, try asking Audric in chat — &quot;show my full
          portfolio&quot;, &quot;activity this week&quot;, &quot;send 5 USDC to
          @alice&quot; all work today.
        </p>
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md bg-fg-primary px-5 font-mono text-[11px] text-fg-inverse uppercase tracking-[0.08em] transition-opacity hover:opacity-90"
          href="/chat"
        >
          Open chat
        </Link>
      </div>
    </div>
  );
}
