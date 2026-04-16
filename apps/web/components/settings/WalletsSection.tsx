'use client';

import { useState, useEffect, useCallback } from 'react';
import { truncateAddress } from '@/lib/format';

interface WalletsSectionProps {
  address: string;
  jwt: string | null;
}

interface LinkedWallet {
  id: string;
  suiAddress: string;
  label: string | null;
  isPrimary: boolean;
}

export function WalletsSection({ address, jwt }: WalletsSectionProps) {
  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletLabel, setNewWalletLabel] = useState('');
  const [walletError, setWalletError] = useState('');
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletDeleting, setWalletDeleting] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    if (!address || !jwt) return;
    setWalletsLoading(true);
    try {
      const res = await fetch(`/api/user/wallets?address=${address}`, {
        headers: { 'x-zklogin-jwt': jwt },
      });
      if (res.ok) {
        const data = await res.json();
        setLinkedWallets(data.wallets ?? []);
      }
    } catch { /* ignore */ }
    finally { setWalletsLoading(false); }
  }, [address, jwt]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  const handleAddWallet = async () => {
    if (!address || !jwt) return;
    const trimmed = newWalletAddress.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
      setWalletError('Enter a valid Sui address');
      return;
    }
    setWalletSaving(true);
    setWalletError('');
    try {
      const res = await fetch('/api/user/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-zklogin-jwt': jwt },
        body: JSON.stringify({ address, suiAddress: trimmed, label: newWalletLabel.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setWalletError(data.error ?? 'Failed to link wallet');
        return;
      }
      setNewWalletAddress('');
      setNewWalletLabel('');
      await fetchWallets();
    } catch { setWalletError('Network error'); }
    finally { setWalletSaving(false); }
  };

  const handleRemoveWallet = async (id: string) => {
    if (!address || !jwt) return;
    setWalletDeleting(id);
    try {
      await fetch(`/api/user/wallets/${id}?address=${address}`, {
        method: 'DELETE',
        headers: { 'x-zklogin-jwt': jwt },
      });
      setLinkedWallets((prev) => prev.filter((w) => w.id !== id));
    } catch { /* ignore */ }
    finally { setWalletDeleting(null); }
  };

  return (
    <section className="space-y-5">
      <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
        Wallets
      </h2>
      <p className="text-sm text-muted leading-relaxed">
        Link additional wallets to view aggregated portfolio data across all your addresses.
      </p>

      {/* Primary wallet */}
      <div className="rounded-xl border border-border bg-surface/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground font-mono">
                {address ? truncateAddress(address) : '—'}
              </p>
              <span className="font-mono text-[9px] tracking-wider text-success uppercase bg-success/10 px-1.5 py-0.5 rounded">
                Primary
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Linked wallets */}
      {walletsLoading ? (
        <p className="text-sm text-muted">Loading wallets...</p>
      ) : (
        <>
          {linkedWallets.map((w) => (
            <div key={w.id} className="rounded-xl border border-border bg-surface/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground font-mono">
                    {truncateAddress(w.suiAddress)}
                  </p>
                  {w.label && (
                    <p className="text-xs text-muted mt-0.5">{w.label}</p>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveWallet(w.id)}
                  disabled={walletDeleting === w.id}
                  className="text-xs text-muted hover:text-error transition"
                >
                  {walletDeleting === w.id ? '...' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Add wallet form */}
      <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
        <p className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">Add Wallet</p>
        <input
          type="text"
          value={newWalletAddress}
          onChange={(e) => { setNewWalletAddress(e.target.value); setWalletError(''); }}
          placeholder="0x..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent"
          spellCheck={false}
        />
        <input
          type="text"
          value={newWalletLabel}
          onChange={(e) => setNewWalletLabel(e.target.value)}
          placeholder="Label (optional, e.g. Cold Wallet)"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent"
          maxLength={50}
        />
        {walletError && <p className="text-xs text-error">{walletError}</p>}
        <button
          onClick={handleAddWallet}
          disabled={walletSaving || !newWalletAddress.trim()}
          className={`rounded-md bg-foreground px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-background uppercase transition ${
            walletSaving || !newWalletAddress.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
          }`}
        >
          {walletSaving ? 'Linking...' : 'Link Wallet'}
        </button>
      </div>
    </section>
  );
}
