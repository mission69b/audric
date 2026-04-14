'use client';

import { useState, useMemo } from 'react';
import { useContacts, type Contact } from '@/hooks/useContacts';
import { truncateAddress } from '@/lib/format';

interface ContactsPanelProps {
  address: string;
  onSendMessage: (text: string) => void;
}

type DetailTab = 'chat' | 'send' | 'activity' | 'notes';

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, var(--n700) 50%, #4a4a4a 50%)',
  'linear-gradient(135deg, #2a3a2a 50%, #3a4a3a 50%)',
  'linear-gradient(135deg, #1a2a3a 50%, #2a3a4a 50%)',
  'linear-gradient(135deg, #3a2a2a 50%, #4a3a3a 50%)',
  'linear-gradient(135deg, #2a2a3a 50%, #3a3a4a 50%)',
];

export function ContactsPanel({ address, onSendMessage }: ContactsPanelProps) {
  const { contacts, loaded, addContact, removeContact } = useContacts(address);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('chat');

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      c => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const handleAdd = async () => {
    if (!newName.trim() || !newAddress.trim()) return;
    await addContact(newName.trim(), newAddress.trim());
    setNewName('');
    setNewAddress('');
    setShowAddForm(false);
  };

  const handleRemove = async (addr: string) => {
    setDeleting(addr);
    await removeContact(addr);
    if (selectedContact?.address === addr) setSelectedContact(null);
    setDeleting(null);
  };

  const DETAIL_TABS: { id: DetailTab; label: string }[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'send', label: 'Send' },
    { id: 'activity', label: 'Activity' },
    { id: 'notes', label: 'Notes' },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl flex flex-col h-full">
      {!loaded ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      ) : contacts.length === 0 && !showAddForm ? (
        <div className="flex flex-col items-center justify-center py-16 text-center flex-1 px-4">
          <span className="text-4xl mb-4">👥</span>
          <p className="text-sm text-muted mb-2">No contacts yet</p>
          <p className="text-xs text-dim max-w-md mb-6 leading-relaxed">
            When you send to a new address, Audric will offer to save it. You can also add contacts manually.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-6 py-2.5 hover:bg-surface transition"
          >
            Add Your First Contact
          </button>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Contact list */}
          <div className="w-full md:w-[260px] shrink-0 flex flex-col border-r border-border">
            {/* Header */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-[14px] font-medium text-foreground mb-0.5">Contacts</p>
              <p className="text-[11px] text-dim">One place to manage contacts.</p>
            </div>

            {/* Search */}
            <div className="mx-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 mb-2">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent border-none outline-none text-[12px] text-foreground placeholder:text-dim"
              />
              <span className="font-mono text-[9px] text-border-bright bg-[var(--n700)] px-[5px] py-px rounded-[3px]">⌘S</span>
            </div>

            {/* Column headers */}
            <div className="flex items-center justify-between px-4 py-1.5 border-b border-border">
              <span className="font-mono text-[8px] tracking-[0.1em] uppercase text-dim flex-1">Name</span>
              <span className="font-mono text-[8px] tracking-[0.1em] uppercase text-dim w-[80px] text-right">Last sent</span>
            </div>

            {/* Contact rows */}
            <div className="flex-1 overflow-y-auto">
              {filtered.map((c, i) => (
                <button
                  key={c.address}
                  onClick={() => { setSelectedContact(c); setActiveTab('chat'); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                    selectedContact?.address === c.address
                      ? 'bg-surface border-r-2 border-r-foreground'
                      : 'hover:bg-surface/50'
                  }`}
                >
                  <div
                    className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 text-[10px] font-medium text-[var(--n300)]"
                    style={{ background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}
                  >
                    {getInitials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-foreground font-medium truncate">{c.name}</p>
                    <p className="font-mono text-[9px] text-dim truncate">{truncateAddress(c.address)}</p>
                  </div>
                  <span className="font-mono text-[9px] text-dim shrink-0 w-[80px] text-right">--</span>
                </button>
              ))}

              {/* Add contact row */}
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-t border-dashed border-border hover:bg-surface/50 transition"
              >
                <div className="w-[30px] h-[30px] rounded-full border border-dashed border-border-bright flex items-center justify-center shrink-0">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <span className="text-[11px] text-dim">Add contact</span>
              </button>

              {filtered.length === 0 && search && (
                <p className="text-xs text-dim text-center py-4">No matches</p>
              )}
            </div>

            {/* Footer count */}
            <div className="px-3 py-2 border-t border-border">
              <p className="font-mono text-[9px] tracking-[0.08em] uppercase text-dim">
                Showing {filtered.length} of {contacts.length}
              </p>
            </div>
          </div>

          {/* RIGHT: Contact detail */}
          <div className="hidden md:flex flex-1 flex-col overflow-y-auto">
            {showAddForm ? (
              <div className="p-6 space-y-3">
                <h3 className="text-sm font-medium text-foreground mb-2">Add contact</h3>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Name (e.g. Alice)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="text"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  placeholder="0x..."
                  spellCheck={false}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    disabled={!newName.trim() || !newAddress.trim()}
                    className="rounded-full bg-foreground text-background font-mono text-[11px] tracking-[0.08em] uppercase px-5 py-2 hover:opacity-90 transition disabled:opacity-40"
                  >
                    Save Contact
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="font-mono text-[11px] tracking-[0.08em] uppercase text-muted hover:text-foreground transition px-3 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : selectedContact ? (
              <div className="flex flex-col h-full">
                {/* Profile card */}
                <div className="flex flex-col items-center px-6 pt-6 pb-4">
                  <div
                    className="w-[56px] h-[56px] rounded-full flex items-center justify-center text-[18px] font-medium text-[var(--n300)] mb-3"
                    style={{ background: AVATAR_GRADIENTS[contacts.findIndex(c => c.address === selectedContact.address) % AVATAR_GRADIENTS.length] }}
                  >
                    {getInitials(selectedContact.name)}
                  </div>
                  <p className="text-[16px] font-medium text-foreground mb-1">{selectedContact.name}</p>
                  <p className="font-mono text-[10px] text-dim mb-3">{truncateAddress(selectedContact.address)}</p>
                  <div className="flex gap-2 mb-3">
                    <span className="font-mono text-[9px] tracking-[0.06em] uppercase bg-success/12 text-success px-2 py-0.5 rounded">Verified</span>
                    <span className="font-mono text-[9px] tracking-[0.06em] uppercase bg-[var(--n700)] text-muted px-2 py-0.5 rounded">Saved</span>
                  </div>
                  <button
                    onClick={() => onSendMessage(`Send USDC to ${selectedContact.name} — ${truncateAddress(selectedContact.address)}`)}
                    className="w-full font-mono text-[11px] tracking-[0.08em] uppercase text-background bg-foreground rounded-full py-2.5 hover:opacity-90 transition text-center"
                  >
                    Send →
                  </button>
                </div>

                {/* Detail fields */}
                <div className="px-6 pb-4 space-y-1.5">
                  <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim mb-2">Details</p>
                  <DetailField label="Address" value={truncateAddress(selectedContact.address)} mono />
                  <DetailField label="Added" value="--" />
                  <DetailField label="Total sent" value="--" accent />
                  <DetailField label="Last tx" value="--" />
                  <DetailField label="Network" value="Sui mainnet" />
                </div>

                {/* Detail tabs */}
                <div className="flex gap-1 px-6 border-b border-border">
                  {DETAIL_TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors ${
                        activeTab === tab.id ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                  {activeTab === 'chat' && (
                    <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
                      <p className="font-mono text-[9px] tracking-[0.08em] uppercase text-dim mb-2">Start a conversation</p>
                      <p className="text-[11px] text-border-bright text-center leading-relaxed mb-4">
                        Ask about {selectedContact.name}&apos;s transactions, send money, or get a summary of your financial history together.
                      </p>
                      <button
                        onClick={() => onSendMessage(`Tell me about my transaction history with ${selectedContact.name} — ${selectedContact.address}`)}
                        className="font-mono text-[10px] tracking-[0.06em] uppercase text-background bg-foreground px-4 py-2 rounded-full hover:opacity-90 transition"
                      >
                        View history with {selectedContact.name} →
                      </button>
                    </div>
                  )}

                  {activeTab === 'send' && (
                    <div className="p-4 space-y-2">
                      <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim mb-1">Quick send</p>
                      {[10, 50].map(amt => (
                        <button
                          key={amt}
                          onClick={() => onSendMessage(`Send $${amt} USDC to ${selectedContact.name} — ${selectedContact.address}`)}
                          className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-[var(--n700)] hover:border-border-bright transition"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[13px]">$</span>
                            <div>
                              <p className="text-[12px] text-[var(--n300)] font-medium">Send ${amt} USDC</p>
                              <p className="text-[10px] text-dim">{amt === 50 ? 'same as last time' : 'quick · confirm in chat'}</p>
                            </div>
                          </div>
                          <span className="text-border-bright text-lg">›</span>
                        </button>
                      ))}
                      <button
                        onClick={() => onSendMessage(`Send a custom amount to ${selectedContact.name} — ${selectedContact.address}, ask me how much`)}
                        className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-[var(--n700)] hover:border-border-bright transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[13px]">✎</span>
                          <div>
                            <p className="text-[12px] text-[var(--n300)] font-medium">Custom amount</p>
                            <p className="text-[10px] text-dim">I&apos;ll ask how much</p>
                          </div>
                        </div>
                        <span className="text-border-bright text-lg">›</span>
                      </button>
                    </div>
                  )}

                  {activeTab === 'activity' && (
                    <div className="px-4 py-4 text-center">
                      <p className="text-[11px] text-dim">Transaction history with {selectedContact.name} will appear here.</p>
                      <button
                        onClick={() => onSendMessage(`Show transaction history with ${selectedContact.address}`)}
                        className="font-mono text-[10px] tracking-[0.06em] uppercase text-info mt-3 hover:underline"
                      >
                        Load activity →
                      </button>
                    </div>
                  )}

                  {activeTab === 'notes' && (
                    <div className="px-4 py-4 text-center">
                      <p className="text-[11px] text-dim">Contact notes coming soon.</p>
                    </div>
                  )}
                </div>

                {/* Remove action */}
                <div className="px-6 py-3 border-t border-border">
                  <button
                    onClick={() => handleRemove(selectedContact.address)}
                    disabled={deleting === selectedContact.address}
                    className="font-mono text-[10px] tracking-[0.1em] uppercase text-error hover:text-error/80 transition"
                  >
                    {deleting === selectedContact.address ? 'Removing...' : 'Remove Contact'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-center py-12">
                <p className="text-sm text-dim">Select a contact to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile: detail overlay */}
      {selectedContact && (
        <div className="md:hidden fixed inset-0 bg-background z-50 p-4 overflow-y-auto">
          <button
            onClick={() => setSelectedContact(null)}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-foreground mb-4 flex items-center gap-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </button>
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-[56px] h-[56px] rounded-full flex items-center justify-center text-[18px] font-medium text-[var(--n300)] mb-3"
              style={{ background: AVATAR_GRADIENTS[contacts.findIndex(c => c.address === selectedContact.address) % AVATAR_GRADIENTS.length] }}
            >
              {getInitials(selectedContact.name)}
            </div>
            <p className="text-[16px] font-medium text-foreground mb-1">{selectedContact.name}</p>
            <p className="font-mono text-[10px] text-dim mb-3">{truncateAddress(selectedContact.address)}</p>
            <div className="flex gap-2">
              <span className="font-mono text-[9px] tracking-[0.06em] uppercase bg-success/12 text-success px-2 py-0.5 rounded">Verified</span>
              <span className="font-mono text-[9px] tracking-[0.06em] uppercase bg-[var(--n700)] text-muted px-2 py-0.5 rounded">Saved</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => { onSendMessage(`Send 5 USDC to ${selectedContact.name}`); setSelectedContact(null); }}
              className="font-mono text-[11px] tracking-[0.08em] uppercase text-background bg-foreground rounded-full px-4 py-2 hover:opacity-90 transition"
            >
              Send →
            </button>
            <button
              onClick={() => { onSendMessage(`Show transaction history with ${selectedContact.address}`); setSelectedContact(null); }}
              className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
            >
              History
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(selectedContact.address)}
              className="font-mono text-[11px] tracking-[0.08em] uppercase text-muted border border-border rounded-full px-4 py-2 hover:bg-surface transition"
            >
              Copy Address
            </button>
          </div>
          <div className="pt-4 border-t border-border">
            <button
              onClick={() => handleRemove(selectedContact.address)}
              disabled={deleting === selectedContact.address}
              className="font-mono text-[10px] tracking-[0.1em] uppercase text-error"
            >
              {deleting === selectedContact.address ? 'Removing...' : 'Remove Contact'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/50">
      <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-dim">{label}</span>
      <span className={`text-[11px] ${mono ? 'font-mono text-[10px]' : ''} ${accent ? 'text-success' : 'text-muted'}`}>{value}</span>
    </div>
  );
}
