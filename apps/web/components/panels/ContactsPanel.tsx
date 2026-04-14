'use client';

import { useState, useMemo } from 'react';
import { useContacts, type Contact } from '@/hooks/useContacts';
import { truncateAddress } from '@/lib/format';

interface ContactsPanelProps {
  address: string;
  onSendMessage: (text: string) => void;
}

export function ContactsPanel({ address, onSendMessage }: ContactsPanelProps) {
  const { contacts, loaded, addContact, removeContact } = useContacts(address);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg text-foreground">Contacts</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
        >
          {showAddForm ? 'Cancel' : '+ Add Contact'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-lg border border-border bg-surface p-4 mb-4 space-y-3">
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
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || !newAddress.trim()}
            className="rounded-full bg-foreground text-background font-mono text-[11px] tracking-[0.08em] uppercase px-5 py-2 hover:opacity-90 transition disabled:opacity-40"
          >
            Save Contact
          </button>
        </div>
      )}

      {!loaded ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center flex-1">
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
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 flex-1 min-h-0">
          {/* Left pane: contact list */}
          <div className="space-y-2 md:border-r md:border-border md:pr-4 overflow-y-auto">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent mb-2"
            />
            {filtered.map(c => (
              <button
                key={c.address}
                onClick={() => setSelectedContact(c)}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition ${
                  selectedContact?.address === c.address
                    ? 'bg-surface border border-border-bright'
                    : 'hover:bg-surface border border-transparent'
                }`}
              >
                <p className="text-sm text-foreground font-medium truncate">{c.name}</p>
                <p className="font-mono text-[10px] text-muted mt-0.5">{truncateAddress(c.address)}</p>
              </button>
            ))}
            {filtered.length === 0 && search && (
              <p className="text-xs text-dim text-center py-4">No matches</p>
            )}
          </div>

          {/* Right pane: contact detail */}
          <div className="hidden md:block overflow-y-auto">
            {selectedContact ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg text-foreground font-medium">{selectedContact.name}</h3>
                    <p className="font-mono text-xs text-muted mt-1 break-all">{selectedContact.address}</p>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedContact.address)}
                    className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-foreground transition shrink-0"
                  >
                    Copy
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onSendMessage(`Send 5 USDC to ${selectedContact.name}`)}
                    className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
                  >
                    💸 Send
                  </button>
                  <button
                    onClick={() => onSendMessage(`Show transaction history with ${selectedContact.address}`)}
                    className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
                  >
                    📋 History
                  </button>
                </div>

                <div className="pt-4 border-t border-border">
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

          {/* Mobile: detail overlay */}
          {selectedContact && (
            <div className="md:hidden fixed inset-0 bg-background z-50 p-4">
              <button
                onClick={() => setSelectedContact(null)}
                className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-foreground mb-4 flex items-center gap-1"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Back
              </button>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg text-foreground font-medium">{selectedContact.name}</h3>
                  <p className="font-mono text-xs text-muted mt-1 break-all">{selectedContact.address}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => { onSendMessage(`Send 5 USDC to ${selectedContact.name}`); setSelectedContact(null); }}
                    className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
                  >
                    💸 Send
                  </button>
                  <button
                    onClick={() => { onSendMessage(`Show transaction history with ${selectedContact.address}`); setSelectedContact(null); }}
                    className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
                  >
                    📋 History
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
