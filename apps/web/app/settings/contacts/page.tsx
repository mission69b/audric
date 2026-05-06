'use client';

/**
 * SPEC 10 D.5 — `/settings/contacts` real route.
 *
 * Wraps `ContactsPage` (the full CRUD UI) in the same `AuthGuard` shell
 * the rest of `/settings` uses. Mirrors the header strip + content
 * column layout from `app/settings/page.tsx` so navigation feels
 * continuous; we don't introduce a shared settings layout because
 * settings is still a single-page surface (the existing `/settings`
 * remains the index, this is the dedicated contacts deep-link).
 *
 * The existing `ContactsSection` (rendered at `/settings?section=
 * contacts`) stays as the slim inline summary; its "open the full
 * Contacts screen" link now lands here.
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { ContactsPage } from '@/components/settings/ContactsPage';

function ContactsRouteContent() {
  const { address } = useZkLogin();

  return (
    <main className="flex flex-col h-screen overflow-hidden bg-surface-page">
      <header className="flex items-center justify-between px-6 sm:px-8 py-[18px] border-b border-border-subtle">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-[13px] text-fg-secondary hover:text-fg-primary transition focus-visible:outline-none focus-visible:underline"
        >
          <Icon name="chevron-left" size={14} />
          Settings
        </Link>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-secondary">
          Contacts
        </span>
      </header>
      <section className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-10 py-7">
        <div className="max-w-[640px] mx-auto">
          <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted pb-2.5 border-b border-border-subtle">
            Contacts
          </div>
          <div className="pt-[22px]">
            <ContactsPage address={address} />
          </div>
        </div>
      </section>
    </main>
  );
}

export default function SettingsContactsPage() {
  return (
    <AuthGuard>
      <ContactsRouteContent />
    </AuthGuard>
  );
}
