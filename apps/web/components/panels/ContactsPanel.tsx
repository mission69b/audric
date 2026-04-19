'use client';

// [PHASE 9] Contacts panel — re-skinned to match
// `design_handoff_audric/.../contacts.jsx`.
//
// Layout (full panel width, 280px list + flex detail):
//   • LEFT pane (`bg-surface-sunken`, border-right):
//     - "Contacts" title + subtitle
//     - Search row with `/` keyboard hint
//     - NAME / LAST SENT column headers
//     - Contact rows with gradient avatar
//     - "Add contact" dashed row at the bottom of the list
//     - Footer: SHOWING N OF M
//   • RIGHT pane (scroll, 28/48 padding, inner max-width 640):
//     - <BalanceHero> at top
//     - 64px round avatar + name (22px serif-ish) + mono address
//     - VERIFIED / SAVED tags (verified derived from receive history)
//     - Full-width SEND → button (filled black pill)
//     - DETAILS list (ADDRESS / ADDED / TOTAL SENT / LAST TX / NETWORK)
//     - 4-tab nav (CHAT / SEND / ACTIVITY / NOTES) with bottom-border active
//     - Tab content + REMOVE CONTACT (red, mono) at the bottom
//
// Per the per-panel notes in IMPLEMENTATION_PLAN.md:
//   • CHAT tab — empty state + "VIEW HISTORY WITH X →" CTA
//   • SEND tab — three quick-send rows
//   • ACTIVITY tab — derived from `feed.items` filtered by counterparty
//   • NOTES tab — backed by typed mock stub (`getMockContactNotes`)
//   • REMOVE CONTACT wired to existing `useContacts.removeContact`
//
// Behavior preserved:
//   • `useContacts` shape untouched (contacts, loaded, addContact, removeContact)
//   • All `onSendMessage(...)` prompt strings preserved
//   • Add-contact form path preserved (toggled via "Add contact" dashed row)
//   • Mobile detail overlay preserved (full-screen sheet + Back affordance)

import { useState, useMemo } from 'react';
import { BalanceHero } from '@/components/ui/BalanceHero';
import { Tag } from '@/components/ui/Tag';
import { Icon } from '@/components/ui/Icon';
import { useContacts, type Contact } from '@/hooks/useContacts';
import type { useActivityFeed } from '@/hooks/useActivityFeed';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';
import { truncateAddress } from '@/lib/format';
import { getMockContactNotes } from '@/lib/mocks/contacts';

type FeedState = ReturnType<typeof useActivityFeed>;
type DetailTab = 'chat' | 'send' | 'activity' | 'notes';

interface ContactsPanelProps {
  address: string;
  balance: BalanceHeaderData;
  feed: FeedState;
  onSendMessage: (text: string) => void;
}

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'send', label: 'Send' },
  { id: 'activity', label: 'Activity' },
  { id: 'notes', label: 'Notes' },
];

// Single subtle gradient mirrors the design's `linear-gradient(135deg,
// #D4D4D4, #8F8F8F)` — used for both the list row avatar and the larger
// detail-pane avatar.
const AVATAR_GRADIENT = 'linear-gradient(135deg, #D4D4D4, #8F8F8F)';

function getInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ContactsPanel({ address, balance, feed, onSendMessage }: ContactsPanelProps) {
  const { contacts, loaded, addContact, removeContact } = useContacts(address);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddressInput, setNewAddressInput] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('chat');

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  // Derive per-contact metrics from the activity feed (Phase 9 per-panel
  // note: "derive ACTIVITY from existing tx history filtered by
  // counterparty"). All metrics fall back to "—" when there is no match,
  // matching the design's placeholders.
  const contactMetrics = useMemo(() => {
    const map = new Map<string, {
      verified: boolean;
      lastSentTs: number | null;
      totalSent: number;
      lastTxTs: number | null;
      activity: typeof feed.items;
    }>();
    for (const c of contacts) {
      const items = feed.items.filter(
        (i) => i.counterparty?.toLowerCase() === c.address.toLowerCase(),
      );
      const sent = items.filter((i) => i.direction === 'out');
      const received = items.filter((i) => i.direction === 'in');
      const lastSentTs = sent[0]?.timestamp ?? null;
      const lastTxTs = items[0]?.timestamp ?? null;
      const totalSent = sent.reduce((sum, i) => sum + (i.amount ?? 0), 0);
      map.set(c.address.toLowerCase(), {
        verified: received.length > 0,
        lastSentTs,
        totalSent,
        lastTxTs,
        activity: items,
      });
    }
    return map;
  }, [contacts, feed.items]);

  const networkLabel = feed.network === 'testnet' ? 'Sui testnet' : 'Sui mainnet';

  const handleAdd = async () => {
    if (!newName.trim() || !newAddressInput.trim()) return;
    await addContact(newName.trim(), newAddressInput.trim());
    setNewName('');
    setNewAddressInput('');
    setShowAddForm(false);
  };

  const handleRemove = async (addr: string) => {
    setDeleting(addr);
    await removeContact(addr);
    if (selectedContact?.address === addr) setSelectedContact(null);
    setDeleting(null);
  };

  // The full-screen empty state is preserved — when the user has zero
  // saved contacts and the add-form is closed, prompt them to add one.
  if (loaded && contacts.length === 0 && !showAddForm) {
    return (
      <div className="mx-auto w-full max-w-[820px] px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-[18px]">
        <div className="pt-5 pb-4">
          <BalanceHero
            total={balance.total}
            available={balance.cash}
            earning={balance.savings}
            size="lg"
          />
        </div>
        <div className="rounded-md border border-border-subtle bg-surface-sunken px-6 py-10 text-center space-y-3">
          <p className="text-sm text-fg-primary font-medium">No contacts yet</p>
          <p className="text-[12px] text-fg-muted max-w-[320px] mx-auto leading-relaxed">
            When you send to a new address, Audric will offer to save it. You can also add contacts
            manually.
          </p>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-1.5 h-[30px] px-3.5 rounded-pill border border-border-subtle bg-transparent font-mono text-[10px] leading-[14px] tracking-[0.1em] uppercase text-fg-secondary hover:bg-surface-card hover:border-border-strong hover:text-fg-primary transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            <Icon name="plus" size={11} />
            Add your first contact
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-[820px] px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-md border border-border-subtle bg-surface-sunken animate-pulse" />
        ))}
      </div>
    );
  }

  const selMetrics = selectedContact
    ? contactMetrics.get(selectedContact.address.toLowerCase())
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] h-full overflow-hidden">
      {/* LEFT pane — list + search */}
      <aside className="border-r border-border-subtle bg-surface-sunken flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-2.5">
          <div className="text-[20px] font-medium text-fg-primary leading-tight">Contacts</div>
          <div className="text-[12px] text-fg-muted mt-0.5">One place to manage contacts.</div>
        </div>

        <div className="px-4 pt-1.5 pb-2.5">
          <label className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card px-2.5 py-2 focus-within:border-border-strong transition">
            <span aria-hidden="true" className="shrink-0 text-fg-muted">
              <Icon name="search" size={13} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              aria-label="Search contacts"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-fg-primary placeholder:text-fg-muted"
            />
            <span
              aria-hidden="true"
              className="shrink-0 font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted px-[5px] py-px border border-border-subtle rounded-xs"
            >
              /
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between px-4 pb-1">
          <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">Name</span>
          <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
            Last sent
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pt-1">
          {filtered.map((c) => {
            const metrics = contactMetrics.get(c.address.toLowerCase());
            const lastSent = metrics?.lastSentTs ? relativeTime(metrics.lastSentTs) : '\u2014';
            const isSelected = selectedContact?.address === c.address;
            return (
              <button
                key={c.address}
                type="button"
                onClick={() => { setSelectedContact(c); setActiveTab('chat'); setShowAddForm(false); }}
                className={[
                  'w-full flex items-center gap-2.5 px-2 py-2.5 rounded-md text-left mb-0.5 transition',
                  isSelected
                    ? 'bg-border-subtle'
                    : 'hover:bg-border-subtle/50',
                ].join(' ')}
                aria-current={isSelected ? 'true' : undefined}
              >
                <div
                  className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-[11px] font-semibold text-white"
                  style={{ background: AVATAR_GRADIENT }}
                  aria-hidden="true"
                >
                  {getInitial(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-fg-primary truncate">{c.name}</div>
                  <div className="font-mono text-[10px] text-fg-muted mt-0.5 truncate">
                    {truncateAddress(c.address)}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-fg-muted">{lastSent}</span>
              </button>
            );
          })}

          {filtered.length === 0 && search && (
            <p className="text-[11px] text-fg-muted text-center py-4">No matches</p>
          )}

          <button
            type="button"
            onClick={() => { setShowAddForm(true); setSelectedContact(null); }}
            className="w-full flex items-center gap-2.5 px-2 py-2.5 rounded-md text-left text-fg-secondary hover:bg-border-subtle/50 transition"
          >
            <div
              className="shrink-0 w-7 h-7 rounded-full border border-dashed border-border-strong grid place-items-center text-fg-muted"
              aria-hidden="true"
            >
              <Icon name="plus" size={12} />
            </div>
            <span className="text-[13px]">Add contact</span>
          </button>
        </div>

        <div className="px-4 py-2.5 border-t border-border-subtle">
          <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
            Showing {filtered.length} of {contacts.length}
          </span>
        </div>
      </aside>

      {/* RIGHT pane — detail / add form */}
      <section className="hidden md:flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 lg:px-12 py-7">
          {showAddForm ? (
            <AddContactForm
              name={newName}
              addressValue={newAddressInput}
              onChangeName={setNewName}
              onChangeAddress={setNewAddressInput}
              onSave={handleAdd}
              onCancel={() => { setShowAddForm(false); setNewName(''); setNewAddressInput(''); }}
            />
          ) : selectedContact ? (
            <div className="max-w-[640px] mx-auto flex flex-col gap-[18px]">
              <div className="pt-5 pb-4">
                <BalanceHero
                  total={balance.total}
                  available={balance.cash}
                  earning={balance.savings}
                  size="lg"
                />
              </div>

              <div className="flex flex-col items-center text-center gap-3">
                <div
                  className="w-16 h-16 rounded-full grid place-items-center text-[22px] font-semibold text-white"
                  style={{ background: AVATAR_GRADIENT }}
                  aria-hidden="true"
                >
                  {getInitial(selectedContact.name)}
                </div>
                <div>
                  <div className="text-[22px] font-medium text-fg-primary leading-tight">
                    {selectedContact.name}
                  </div>
                  <div className="font-mono text-[11px] text-fg-muted mt-1">
                    {truncateAddress(selectedContact.address)}
                  </div>
                </div>
                <div className="flex gap-1.5 justify-center">
                  {selMetrics?.verified && <Tag tone="green">Verified</Tag>}
                  <Tag tone="neutral">Saved</Tag>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onSendMessage(`Send USDC to ${selectedContact.name} \u2014 ${selectedContact.address}`)
                }
                className="w-full inline-flex items-center justify-center gap-2 font-mono text-[11px] tracking-[0.1em] uppercase text-fg-inverse bg-fg-primary rounded-pill px-5 py-3.5 hover:opacity-90 active:scale-[0.99] transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                Send &rsaquo;
              </button>

              <div>
                <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
                  Details
                </div>
                <DetailRow
                  label="Address"
                  value={truncateAddress(selectedContact.address)}
                  mono
                />
                <DetailRow label="Added" value={'\u2014'} />
                <DetailRow
                  label="Total sent"
                  value={selMetrics && selMetrics.totalSent > 0 ? `$${selMetrics.totalSent.toFixed(2)}` : '\u2014'}
                />
                <DetailRow
                  label="Last tx"
                  value={selMetrics?.lastTxTs ? relativeTime(selMetrics.lastTxTs) : '\u2014'}
                />
                <DetailRow label="Network" value={networkLabel} />
              </div>

              <div className="flex gap-1.5 border-b border-border-subtle">
                {DETAIL_TABS.map((t) => {
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={[
                        'px-4 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors -mb-px border-b-2',
                        isActive
                          ? 'text-fg-primary border-fg-primary'
                          : 'text-fg-muted border-transparent hover:text-fg-secondary',
                      ].join(' ')}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="py-5">
                {activeTab === 'chat' && (
                  <ChatTab
                    name={selectedContact.name}
                    address={selectedContact.address}
                    onSendMessage={onSendMessage}
                  />
                )}
                {activeTab === 'send' && (
                  <SendTab
                    name={selectedContact.name}
                    address={selectedContact.address}
                    onSendMessage={onSendMessage}
                  />
                )}
                {activeTab === 'activity' && (
                  <ActivityTab
                    name={selectedContact.name}
                    items={selMetrics?.activity ?? []}
                    onSendMessage={onSendMessage}
                    contactAddress={selectedContact.address}
                  />
                )}
                {activeTab === 'notes' && (
                  <NotesTab
                    contactAddress={selectedContact.address}
                    onSendMessage={onSendMessage}
                  />
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => handleRemove(selectedContact.address)}
                  disabled={deleting === selectedContact.address}
                  className="font-mono text-[10px] tracking-[0.1em] uppercase text-error-fg hover:opacity-80 transition disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
                >
                  {deleting === selectedContact.address ? 'Removing\u2026' : 'Remove contact'}
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-[640px] mx-auto flex flex-col gap-[18px]">
              <div className="pt-5 pb-4">
                <BalanceHero
                  total={balance.total}
                  available={balance.cash}
                  earning={balance.savings}
                  size="lg"
                />
              </div>
              <p className="text-sm text-fg-muted text-center py-12">
                Select a contact to view details.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Mobile detail overlay — preserved from the previous skin to keep
          parity on small viewports where the 2-pane grid collapses. */}
      {selectedContact && (
        <div className="md:hidden fixed inset-0 bg-surface-page z-50 overflow-y-auto">
          <div className="px-4 py-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedContact(null)}
              className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary hover:text-fg-primary transition"
            >
              <Icon name="chevron-left" size={12} />
              Back
            </button>
            <button
              type="button"
              onClick={() => handleRemove(selectedContact.address)}
              disabled={deleting === selectedContact.address}
              className="font-mono text-[10px] tracking-[0.1em] uppercase text-error-fg hover:opacity-80 transition disabled:opacity-50"
            >
              {deleting === selectedContact.address ? 'Removing\u2026' : 'Remove'}
            </button>
          </div>
          <div className="px-4 pb-8 max-w-[640px] mx-auto flex flex-col gap-[18px]">
            <div className="flex flex-col items-center text-center gap-3">
              <div
                className="w-16 h-16 rounded-full grid place-items-center text-[22px] font-semibold text-white"
                style={{ background: AVATAR_GRADIENT }}
              >
                {getInitial(selectedContact.name)}
              </div>
              <div className="text-[22px] font-medium text-fg-primary leading-tight">
                {selectedContact.name}
              </div>
              <div className="font-mono text-[11px] text-fg-muted">
                {truncateAddress(selectedContact.address)}
              </div>
              <div className="flex gap-1.5">
                {selMetrics?.verified && <Tag tone="green">Verified</Tag>}
                <Tag tone="neutral">Saved</Tag>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onSendMessage(`Send USDC to ${selectedContact.name} \u2014 ${selectedContact.address}`);
                setSelectedContact(null);
              }}
              className="w-full inline-flex items-center justify-center gap-2 font-mono text-[11px] tracking-[0.1em] uppercase text-fg-inverse bg-fg-primary rounded-pill px-5 py-3.5 hover:opacity-90 active:scale-[0.99] transition"
            >
              Send &rsaquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail row + tab subcomponents ────────────────────────────────────────

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border-subtle">
      <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
        {label}
      </span>
      <span
        className={[
          'text-[13px] text-fg-secondary',
          mono ? 'font-mono' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

function ChatTab({
  name,
  address,
  onSendMessage,
}: {
  name: string;
  address: string;
  onSendMessage: (text: string) => void;
}) {
  return (
    <div className="text-center">
      <div className="text-[15px] font-medium text-fg-primary">Start a conversation</div>
      <p className="text-[12px] text-fg-muted mt-1.5 mb-4 max-w-[360px] mx-auto leading-relaxed">
        Ask about {name}&apos;s transactions, send money, or get a summary of your financial history
        together.
      </p>
      <button
        type="button"
        onClick={() => onSendMessage(`Tell me about my transaction history with ${name} \u2014 ${address}`)}
        className="inline-flex items-center gap-1.5 h-[34px] px-4 rounded-pill border border-border-subtle bg-surface-card font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
      >
        View history with {name.toUpperCase()} &rsaquo;
      </button>
    </div>
  );
}

function SendTab({
  name,
  address,
  onSendMessage,
}: {
  name: string;
  address: string;
  onSendMessage: (text: string) => void;
}) {
  const rows: { glyph: string; title: string; sub: string; prompt: string }[] = [
    {
      glyph: '$',
      title: 'Send $10 USDC',
      sub: 'quick \u00B7 confirm in chat',
      prompt: `Send $10 USDC to ${name} \u2014 ${address}`,
    },
    {
      glyph: '$',
      title: 'Send $50 USDC',
      sub: 'same as last time',
      prompt: `Send $50 USDC to ${name} \u2014 ${address}`,
    },
    {
      glyph: '%',
      title: 'Custom amount',
      sub: "I'll ask how much",
      prompt: `Send a custom amount to ${name} \u2014 ${address}, ask me how much`,
    },
  ];

  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
        Quick send
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <button
            key={r.title}
            type="button"
            onClick={() => onSendMessage(r.prompt)}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-md border border-border-subtle bg-surface-sunken hover:border-border-strong transition text-left focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            <div
              className="shrink-0 w-7 h-7 rounded-full bg-border-subtle grid place-items-center text-[13px] text-fg-primary font-medium"
              aria-hidden="true"
            >
              {r.glyph}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-fg-primary truncate">{r.title}</div>
              <div className="text-[12px] text-fg-muted mt-0.5 truncate">{r.sub}</div>
            </div>
            <span aria-hidden="true" className="text-fg-muted shrink-0">
              <Icon name="chevron-right" size={14} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityTab({
  name,
  items,
  onSendMessage,
  contactAddress,
}: {
  name: string;
  items: { id: string; title: string; amount?: number; direction?: string; timestamp: number }[];
  onSendMessage: (text: string) => void;
  contactAddress: string;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-7">
        <p className="text-[13px] text-fg-muted">No transactions with {name} yet.</p>
        <button
          type="button"
          onClick={() => onSendMessage(`Show transaction history with ${contactAddress}`)}
          className="font-mono text-[10px] tracking-[0.1em] uppercase text-info-solid mt-3 hover:opacity-80 transition focus-visible:outline-none focus-visible:underline"
        >
          Load activity &rsaquo;
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.slice(0, 10).map((item) => {
        const isIn = item.direction === 'in';
        const sign = isIn ? '+' : item.direction === 'out' ? '\u2212' : '';
        const amountStr = item.amount != null ? `${sign}$${item.amount.toFixed(2)}` : null;
        const amountColor = isIn
          ? 'text-success-solid'
          : item.direction === 'out'
            ? 'text-error-fg'
            : 'text-fg-primary';
        return (
          <div
            key={item.id}
            className="flex items-center gap-3.5 px-4 py-3 rounded-md border border-border-subtle bg-surface-sunken"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-fg-primary truncate">{item.title}</div>
              <div className="font-mono text-[9px] tracking-[0.08em] uppercase text-fg-muted mt-1">
                {relativeTime(item.timestamp).toUpperCase()}
              </div>
            </div>
            {amountStr && (
              <div className={`font-mono text-[13px] shrink-0 ${amountColor}`}>{amountStr}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NotesTab({
  contactAddress,
  onSendMessage,
}: {
  contactAddress: string;
  onSendMessage: (text: string) => void;
}) {
  const notes = getMockContactNotes(contactAddress);
  if (notes.length === 0) {
    return (
      <div className="text-center py-7">
        <p className="text-[13px] text-fg-muted">No notes &mdash; click to add.</p>
        <button
          type="button"
          onClick={() => onSendMessage(`Add a note to my contact at ${contactAddress}`)}
          className="font-mono text-[10px] tracking-[0.1em] uppercase text-info-solid mt-3 hover:opacity-80 transition focus-visible:outline-none focus-visible:underline"
        >
          Add note &rsaquo;
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {notes.map((n) => (
        <div
          key={n.id}
          className="px-4 py-3 rounded-md border border-border-subtle bg-surface-sunken text-[13px] text-fg-primary"
        >
          {n.body}
        </div>
      ))}
    </div>
  );
}

function AddContactForm({
  name,
  addressValue,
  onChangeName,
  onChangeAddress,
  onSave,
  onCancel,
}: {
  name: string;
  addressValue: string;
  onChangeName: (v: string) => void;
  onChangeAddress: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const canSave = name.trim().length > 0 && addressValue.trim().length > 0;
  return (
    <div className="max-w-[480px] mx-auto py-12 flex flex-col gap-4">
      <div>
        <h3 className="text-[18px] font-medium text-fg-primary">Add contact</h3>
        <p className="text-[12px] text-fg-muted mt-1">
          Save a name for an address you send to often.
        </p>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        placeholder="Name (e.g. Alice)"
        className="w-full rounded-md border border-border-subtle bg-surface-card px-3 py-2.5 text-[14px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-border-strong transition"
      />
      <input
        type="text"
        value={addressValue}
        onChange={(e) => onChangeAddress(e.target.value)}
        placeholder="0x…"
        spellCheck={false}
        className="w-full rounded-md border border-border-subtle bg-surface-card px-3 py-2.5 font-mono text-[12px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-border-strong transition"
      />
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-inverse bg-fg-primary rounded-pill px-5 py-2.5 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          Save contact
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary hover:text-fg-primary transition px-3 py-2.5 focus-visible:outline-none focus-visible:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
