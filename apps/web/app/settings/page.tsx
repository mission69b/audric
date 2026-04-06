'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { truncateAddress } from '@/lib/format';
import { SUI_NETWORK } from '@/lib/constants';

type Section = 'account' | 'features' | 'safety' | 'contacts' | 'sessions';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'features', label: 'Features' },
  { id: 'safety', label: 'Safety' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'sessions', label: 'Sessions' },
];

function SettingsContent() {
  const { address, session, logout, refresh, expiringSoon } = useZkLogin();
  const [activeSection, setActiveSection] = useState<Section>('account');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiresAt = session?.expiresAt;
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  return (
    <main className="flex flex-1 flex-col items-center pt-10 pb-16 px-4">
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/new"
            className="flex items-center gap-1 text-sm text-muted hover:text-foreground transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to chat
          </Link>
          <h1 className="font-mono text-xs tracking-[0.12em] text-foreground uppercase ml-auto">
            Settings
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-6">
          <nav className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible pb-2 sm:pb-0">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition text-left ${
                  activeSection === s.id
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-muted hover:text-foreground hover:bg-surface'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="space-y-6">
            {activeSection === 'account' && (
              <section className="space-y-5">
                <SectionTitle>Account</SectionTitle>

                <SettingsRow label="Wallet address">
                  <span className="font-mono text-xs text-foreground">
                    {address ? truncateAddress(address) : '—'}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="ml-2 font-mono text-[10px] tracking-wider text-muted uppercase hover:text-foreground transition"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </SettingsRow>

                <SettingsRow label="Network">
                  <span className="text-sm text-foreground capitalize">{SUI_NETWORK}</span>
                </SettingsRow>

                <SettingsRow label="Sign-in session">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm text-foreground">
                      {expiryDate
                        ? `Expires ${expiryDate.toLocaleDateString()} (${daysLeft}d)`
                        : '—'}
                    </span>
                    {expiringSoon && (
                      <span className="text-xs text-warning flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                        Expiring soon
                      </span>
                    )}
                  </div>
                </SettingsRow>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => refresh()}
                    className="rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition"
                  >
                    Refresh Session
                  </button>
                  <button
                    onClick={logout}
                    className="rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition"
                  >
                    Sign Out
                  </button>
                </div>
              </section>
            )}

            {activeSection === 'features' && (
              <section className="space-y-5">
                <SectionTitle>Features</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  Feature toggles, allowance budget, and auto-compound settings will appear here when the allowance model ships.
                </p>
              </section>
            )}

            {activeSection === 'safety' && (
              <section className="space-y-5">
                <SectionTitle>Safety</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  Transaction limits and daily budget controls will appear here.
                </p>
              </section>
            )}

            {activeSection === 'contacts' && (
              <section className="space-y-5">
                <SectionTitle>Contacts</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  Your saved contacts will appear here. Send to an address and you&apos;ll be prompted to save it.
                </p>
              </section>
            )}

            {activeSection === 'sessions' && (
              <section className="space-y-5">
                <SectionTitle>Conversations</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  Chat history and session management will appear here.
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
      {children}
    </h2>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
