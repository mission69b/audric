'use client';

import { useState, useEffect } from 'react';

interface StorePanelProps {
  onSendMessage?: (text: string) => void;
  address?: string;
  jwt?: string;
}

interface StoreEarnings {
  totalEarned: number;
  totalSales: number;
  thisMonth: number;
  thisMonthSales: number;
  storefrontUsername: string | null;
}

interface StoreListing {
  id: string;
  emoji: string;
  title: string;
  price: number;
  sales: number;
  earned: number;
}

const SYNC_PRODUCTS = [
  {
    id: 'art',
    emoji: '🎨',
    title: 'AI Art packs',
    desc: 'Stability AI · 5–10 pieces · $5–$20 USDC · sync',
    prompt: 'Create an AI art pack — 10 pieces on a theme I choose',
  },
  {
    id: 'tshirts',
    emoji: '👕',
    title: 'T-shirts + merch',
    desc: 'AI art → Printful · $25–$45 USDC · sync',
    prompt: 'Create a T-shirt design from AI art and list it via Printful',
  },
  {
    id: 'prompts',
    emoji: '✎',
    title: 'Prompt packs',
    desc: '50 curated prompts · $3–$10 USDC · sync',
    prompt: 'Create a prompt pack and list it for sale',
  },
  {
    id: 'guides',
    emoji: '📄',
    title: 'Short guides + ebooks',
    desc: 'Claude + PDFShift · $5–$15 USDC · sync',
    prompt: 'Create a short guide or ebook on a topic and list it for sale',
  },
  {
    id: 'cards',
    emoji: '💌',
    title: 'Greeting cards',
    desc: 'AI art → Lob prints + mails · $8–$15 USDC · sync',
    prompt: 'Create a personalised AI greeting card via Lob',
  },
];

const ASYNC_PRODUCTS = [
  {
    id: 'music',
    emoji: '🎵',
    title: 'AI Music',
    desc: 'Suno · ~2 min · $5–$15 USDC',
    prompt: 'Tell me about AI music generation in the Audric Store',
  },
  {
    id: 'video',
    emoji: '🎬',
    title: 'Music videos + ads',
    desc: 'Runway · 15–60s · $15–$60 USDC',
    prompt: 'Tell me about AI video generation in the Audric Store',
  },
  {
    id: 'avatar',
    emoji: '🤖',
    title: 'Avatar explainer videos',
    desc: 'Heygen · from script · $15–$50 USDC',
    prompt: 'Tell me about avatar video generation in the Audric Store',
  },
];

export function StorePanel({ onSendMessage, address, jwt }: StorePanelProps) {
  const [earnings, setEarnings] = useState<StoreEarnings | null>(null);
  const [listings, setListings] = useState<StoreListing[]>([]);

  useEffect(() => {
    if (!address || !jwt) return;
    fetch(`/api/store/earnings?address=${address}`, {
      headers: { 'x-zklogin-jwt': jwt },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setEarnings(data);
          setListings(data.listings ?? []);
        }
      })
      .catch(() => {});
  }, [address, jwt]);

  const hasListings = listings.length > 0;
  const hasEarnings = earnings && earnings.totalEarned > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header + earnings summary */}
      <div className="shrink-0 px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-heading text-[18px] text-foreground mb-0.5">Audric Store</h2>
            <p className="text-[11px] text-dim">Generate · list · earn USDC · 8% platform fee</p>
          </div>
          <button
            onClick={() => onSendMessage?.('I want to create and sell something on the Audric Store — what can I make?')}
            className="font-mono text-[10px] tracking-[0.08em] uppercase text-background bg-foreground rounded-lg px-4 py-2.5 hover:opacity-80 transition"
          >
            Create + list →
          </button>
        </div>

        {/* Earnings stats grid */}
        {hasEarnings ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[var(--n800)] border border-border rounded-lg p-2.5">
              <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim mb-1">Total earned</div>
              <div className="text-[18px] font-light text-[var(--color-success)]">${earnings.totalEarned.toFixed(2)}</div>
              <div className="text-[10px] text-dim">lifetime · {earnings.totalSales} sale{earnings.totalSales !== 1 ? 's' : ''}</div>
            </div>
            <div className="bg-[var(--n800)] border border-border rounded-lg p-2.5">
              <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim mb-1">This month</div>
              <div className="text-[18px] font-light text-foreground">${earnings.thisMonth.toFixed(2)}</div>
              <div className="text-[10px] text-dim">{earnings.thisMonthSales} sale{earnings.thisMonthSales !== 1 ? 's' : ''}</div>
            </div>
            <button
              onClick={() => onSendMessage?.('Show me my public storefront')}
              className="bg-[var(--n800)] border border-border rounded-lg p-2.5 text-left hover:border-[var(--border-bright)] transition"
            >
              <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim mb-1">Storefront</div>
              <div className="text-[11px] text-[var(--color-info)] font-mono">audric.ai/</div>
              <div className="text-[10px] text-dim">{earnings.storefrontUsername ?? 'set up'}</div>
            </button>
          </div>
        ) : (
          <div className="bg-[var(--n800)] border border-border rounded-lg p-3 text-center">
            <p className="text-[11px] text-dim leading-relaxed">
              No sales yet. Create your first product and start earning USDC.
            </p>
          </div>
        )}

        {/* Income integration callout */}
        {hasEarnings && (
          <div className="mt-3 bg-[rgba(60,193,78,0.05)] border border-[rgba(60,193,78,0.12)] rounded-lg px-3 py-2 text-[11px] text-dim leading-[1.7]">
            Store earnings land in your wallet as USDC — same as any payment received. They show in{' '}
            <strong className="text-[var(--n400)]">Activity → Store</strong>, count toward your{' '}
            <strong className="text-[var(--n400)]">Goals</strong>, and appear in your{' '}
            <strong className="text-[var(--n400)]">weekly income report</strong>.
            <button
              onClick={() => onSendMessage?.('Save all my store earnings into NAVI savings')}
              className="ml-2 font-mono text-[9px] tracking-[0.06em] uppercase text-muted border border-border rounded px-2 py-0.5 hover:text-foreground hover:border-[var(--border-bright)] transition"
            >
              Save earnings →
            </button>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6">
        {/* Your listings */}
        {hasListings && (
          <div className="mb-4">
            <SectionDate>Your listings</SectionDate>
            {listings.map((listing) => (
              <ProductRow
                key={listing.id}
                emoji={listing.emoji}
                title={listing.title}
                desc={`$${listing.price} USDC · ${listing.sales} sale${listing.sales !== 1 ? 's' : ''} · $${listing.earned.toFixed(2)} earned`}
                descSuccess
                onClick={() => onSendMessage?.(`Show me the status and sales of my ${listing.title} listing`)}
              />
            ))}
          </div>
        )}

        {/* Create new — available now */}
        <SectionDate>Create new — available now</SectionDate>
        {SYNC_PRODUCTS.map((p) => (
          <ProductRow
            key={p.id}
            emoji={p.emoji}
            title={p.title}
            desc={p.desc}
            onClick={() => onSendMessage?.(p.prompt)}
          />
        ))}

        {/* Automate store content */}
        <button
          onClick={() => onSendMessage?.('Automate my store — generate and list a new art pack every Monday')}
          className="w-full flex items-center gap-3 px-3 py-3 border border-dashed border-border rounded-lg mb-1 hover:bg-[var(--n800)] transition group"
        >
          <span className="text-[11px] shrink-0 w-7 text-center">⟳</span>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-[12px] text-dim">Automate store content</div>
            <div className="text-[10px] text-[var(--border-bright)] mt-0.5">Generate + list on a schedule · trust ladder applies</div>
          </div>
        </button>

        {/* Phase 5: SOON */}
        <SectionDate className="mt-4">Coming Phase 5 — async generation</SectionDate>
        {ASYNC_PRODUCTS.map((p) => (
          <ProductRow
            key={p.id}
            emoji={p.emoji}
            title={p.title}
            desc={p.desc}
            onClick={() => onSendMessage?.(p.prompt)}
            soon
          />
        ))}
      </div>
    </div>
  );
}

function SectionDate({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-[9px] tracking-[0.08em] uppercase text-dim pb-2 pt-1 ${className ?? ''}`}>
      {children}
    </div>
  );
}

function ProductRow({
  emoji,
  title,
  desc,
  descSuccess,
  onClick,
  soon,
}: {
  emoji: string;
  title: string;
  desc: string;
  descSuccess?: boolean;
  onClick: () => void;
  soon?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-border hover:bg-[var(--n800)] transition group ${soon ? 'opacity-45' : ''}`}
    >
      <span className="text-[16px] shrink-0 w-7 text-center">{emoji}</span>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-[12px] text-[var(--n300)] font-medium">{title}</div>
        <div className={`text-[10px] mt-0.5 ${descSuccess ? 'text-[var(--color-success)]' : 'text-dim'}`}>{desc}</div>
      </div>
      {soon ? (
        <span className="font-mono text-[9px] text-dim shrink-0">SOON</span>
      ) : (
        <span className="text-[14px] text-dim group-hover:text-muted transition shrink-0">›</span>
      )}
    </button>
  );
}
