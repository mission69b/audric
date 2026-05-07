'use client';

// [PHASE 11] Store panel — re-skinned to match
// `design_handoff_audric/.../store.jsx`.
//
// Layout (single 820px column shell, top-aligned):
//   • <BalanceHero> at top
//   • Header row: serif "Audric Store" + thin subtitle on left, outlined
//     `CREATE + LIST ›` pill on right
//   • Empty-state notice card ("No sales yet…") OR earnings stat grid +
//     income-integration callout when sales > 0 (preserves the existing
//     surfaces that real `/api/store/earnings` data would populate)
//   • "YOUR LISTINGS" section (only when listings > 0) — preserves the
//     real-data path
//   • "CREATE NEW — AVAILABLE NOW" eyebrow + product list (each row:
//     emoji, title, sub, chevron, hairline divider).
//   • "COMING PHASE 5 — ASYNC GENERATION" eyebrow + soon list (opacity
//
// [CHIP-Review-2.5 PR2.5-7 — 2026-05-07] Removed the dashed "Automate
// store content / Generate + list on a schedule · trust ladder applies"
// card. Two dead-feature refs in one widget: scheduled actions (S.7) and
// trust ladder (S.7).
// [CHIP-Review-2.5 PR2.5-6 — 2026-05-07] Dropped "count toward your
// Goals" from the earnings callout — Goals retired in SPEC 17.
//     0.55, mono SOON badge per row).
//
// Behavior preserved:
//   • `useToast` "coming soon" handler shared across all rows + header
//     button (no real create/list flow exists yet)
//   • `/api/store/earnings` fetch + earnings/listings state machinery
//     untouched (only re-skinned)
//   • SYNC_PRODUCTS / ASYNC_PRODUCTS catalogues preserved verbatim,
//     including the prompts (used by the toast handler so chat surfacing
//     stays available if/when wired)

import { useState, useEffect, useCallback } from 'react';
import { BalanceHero } from '@/components/ui/BalanceHero';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';

interface StorePanelProps {
  onSendMessage?: (text: string) => void;
  address?: string;
  jwt?: string;
  balance: BalanceHeaderData;
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
    emoji: '📝',
    title: 'Prompt packs',
    desc: '50 curated prompts · $3–$10 USDC · sync',
    prompt: 'Create a prompt pack and list it for sale',
  },
  {
    id: 'guides',
    emoji: '📖',
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
    emoji: '🎭',
    title: 'Avatar explainer videos',
    desc: 'Heygen · from script · $15–$50 USDC',
    prompt: 'Tell me about avatar video generation in the Audric Store',
  },
];

export function StorePanel({
  onSendMessage: _onSendMessage,
  address,
  jwt,
  balance,
}: StorePanelProps) {
  const toast = useToast();
  const [earnings, setEarnings] = useState<StoreEarnings | null>(null);
  const [listings, setListings] = useState<StoreListing[]>([]);

  const handleComingSoon = useCallback(() => {
    toast.toast('Store creation is being built — stay tuned.', 'info');
  }, [toast]);

  useEffect(() => {
    if (!address || !jwt) return;
    fetch(`/api/store/earnings?address=${address}`, {
      headers: { 'x-zklogin-jwt': jwt },
    })
      .then((r) => (r.ok ? r.json() : null))
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
    <div className="mx-auto w-full max-w-[820px] px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-[18px]">
      <div className="pt-5 pb-4">
        <BalanceHero
          total={balance.total}
          available={balance.cash}
          earning={balance.savings}
          size="lg"
        />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-medium text-fg-primary leading-tight">Audric Store</h2>
          <p className="text-[12px] text-fg-muted mt-1">
            Generate &middot; list &middot; earn USDC &middot; 8% platform fee
          </p>
        </div>
        <button
          type="button"
          onClick={handleComingSoon}
          className="inline-flex items-center gap-1.5 h-[34px] px-4 rounded-pill border border-border-strong bg-surface-card font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary hover:bg-surface-sunken transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          Create + list
          <Icon name="chevron-right" size={11} />
        </button>
      </div>

      {hasEarnings ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Total earned"
              value={`$${earnings.totalEarned.toFixed(2)}`}
              valueAccent="success"
              sub={`lifetime · ${earnings.totalSales} sale${earnings.totalSales !== 1 ? 's' : ''}`}
            />
            <StatCard
              label="This month"
              value={`$${earnings.thisMonth.toFixed(2)}`}
              sub={`${earnings.thisMonthSales} sale${earnings.thisMonthSales !== 1 ? 's' : ''}`}
            />
            <button
              type="button"
              onClick={handleComingSoon}
              className="rounded-md border border-border-subtle bg-surface-sunken p-2.5 text-left hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted mb-1">
                Storefront
              </div>
              <div className="text-[11px] text-info-fg font-mono">audric.ai/</div>
              <div className="text-[10px] text-fg-muted">{earnings.storefrontUsername ?? 'set up'}</div>
            </button>
          </div>

          <div className="rounded-md border border-success-border/40 bg-success-bg px-3 py-2.5 text-[11px] text-fg-secondary leading-[1.7]">
            Store earnings land in your wallet as USDC &mdash; same as any payment received. They
            show in <strong className="text-fg-primary">Activity &rarr; Store</strong> and appear in
            your <strong className="text-fg-primary">weekly income report</strong>.
            <button
              type="button"
              onClick={handleComingSoon}
              className="ml-2 inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.1em] uppercase text-fg-secondary border border-border-subtle rounded-xs px-2 py-0.5 hover:text-fg-primary hover:border-border-strong transition"
            >
              Save earnings &rsaquo;
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-border-subtle bg-surface-sunken px-4 py-3.5 text-center text-[12px] text-fg-muted">
          No sales yet. Create your first product and start earning USDC.
        </div>
      )}

      {hasListings && (
        <section>
          <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
            Your listings
          </div>
          <div className="flex flex-col">
            {listings.map((listing) => (
              <ProductRow
                key={listing.id}
                emoji={listing.emoji}
                title={listing.title}
                desc={`$${listing.price} USDC · ${listing.sales} sale${listing.sales !== 1 ? 's' : ''} · $${listing.earned.toFixed(2)} earned`}
                descAccent="success"
                onClick={handleComingSoon}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
          Create new &mdash; available now
        </div>
        <div className="flex flex-col">
          {SYNC_PRODUCTS.map((p) => (
            <ProductRow
              key={p.id}
              emoji={p.emoji}
              title={p.title}
              desc={p.desc}
              onClick={handleComingSoon}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
          Coming Phase 5 &mdash; async generation
        </div>
        <div className="flex flex-col">
          {ASYNC_PRODUCTS.map((p) => (
            <ProductRow
              key={p.id}
              emoji={p.emoji}
              title={p.title}
              desc={p.desc}
              onClick={handleComingSoon}
              soon
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueAccent,
  sub,
}: {
  label: string;
  value: string;
  valueAccent?: 'success';
  sub: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-sunken p-2.5">
      <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted mb-1">
        {label}
      </div>
      <div
        className={[
          'text-[18px] font-light',
          valueAccent === 'success' ? 'text-success-fg' : 'text-fg-primary',
        ].join(' ')}
      >
        {value}
      </div>
      <div className="text-[10px] text-fg-muted">{sub}</div>
    </div>
  );
}

function ProductRow({
  emoji,
  title,
  desc,
  descAccent,
  onClick,
  soon,
}: {
  emoji: string;
  title: string;
  desc: string;
  descAccent?: 'success';
  onClick: () => void;
  soon?: boolean;
}) {
  if (soon) {
    return (
      <div
        className="w-full flex items-center gap-3 px-3.5 py-3 opacity-55"
        aria-disabled="true"
      >
        <span aria-hidden="true" className="text-[18px] shrink-0 w-7 text-center">
          {emoji}
        </span>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[14px] text-fg-primary">{title}</div>
          <div className="text-[11px] text-fg-muted mt-0.5">{desc}</div>
        </div>
        <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted shrink-0">
          Soon
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3.5 py-3 border-b border-border-subtle text-left hover:bg-surface-sunken transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
    >
      <span aria-hidden="true" className="text-[18px] shrink-0 w-7 text-center">
        {emoji}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-fg-primary">{title}</div>
        <div
          className={[
            'text-[11px] mt-0.5',
            descAccent === 'success' ? 'text-success-fg' : 'text-fg-muted',
          ].join(' ')}
        >
          {desc}
        </div>
      </div>
      <span aria-hidden="true" className="text-fg-muted shrink-0">
        <Icon name="chevron-right" size={14} />
      </span>
    </button>
  );
}
