'use client';

// [PHASE 7] Pay panel — re-skinned to match
// `design_handoff_audric/.../pay.jsx`.
//
// Layout (820px column):
//   • <BalanceHero>                                          (top, lg)
//   • 3-button header strip:  + PAYMENT LINK | + INVOICE | QR  (mono pills)
//   • 4-up "panel-2" stat grid: LINKS / INVOICES / RECEIVED / API SPEND
//     (received uses success-solid for accent, overdue invoices warn)
//   • Green income card "WHERE YOUR INCOME GOES" — rendered only when
//     `received > 0` (matches existing behavior; mock-free)
//   • RECENT list — bg-surface-sunken rows, ✓ / link glyph, mono sub-line,
//     `<Tag>` badges for "VIA WALLET" / "SAVE IT →", chevron-right at end.
//
// Behavior preserved byte-identically:
//   • All `onSendMessage(...)` prompt strings unchanged
//   • `useEffect` data fetch shape preserved (same headers, same endpoint)
//   • `payments` / `stats` / `recentItems` derivations untouched
//   • The "Save it →" badge is a clickable Tag-styled <button> wired to the
//     same prompt that the previous pill button fired (e.stopPropagation so
//     it doesn't double-trigger the row click)
//
// [CHIP-Review-2.5 PR2.5-4 — 2026-05-07] Removed the dashed "Automate
// recurring invoice" upsell row at the bottom of the recent list. Two
// dead-feature refs in one widget: (a) the row's prompt fired the removed
// scheduled-actions feature (S.7 simplification), and (b) the sub-line
// said "trust ladder applies" — also retired in S.7. The row was preserved
// per Phase 7 "no behavior change" but the rule has a half-life and the
// underlying feature is gone now.

import { useState, useEffect, useMemo } from 'react';
import { BalanceHero } from '@/components/ui/BalanceHero';
import { Tag } from '@/components/ui/Tag';
import { Icon } from '@/components/ui/Icon';
import type { BalanceHeaderData } from '@/components/dashboard/BalanceHeader';

interface PayPanelProps {
  address: string;
  jwt: string;
  balance: BalanceHeaderData;
  onSendMessage: (text: string) => void;
  /**
   * Optional deterministic-flow handler for the QR button.
   * When provided, the QR button bypasses the LLM and routes straight to
   * `executeIntent({ action: 'address' })` in dashboard-content.tsx so the
   * user sees the rich Deposit Address receipt (with QR + exchange-specific
   * deposit instructions) instead of an LLM-narrated markdown blob. Falls
   * back to the legacy onSendMessage prompt path if omitted.
   */
  onShowAddress?: () => void;
}

interface Payment {
  id: string;
  slug: string;
  type: 'link' | 'invoice';
  amount: number | null;
  label: string | null;
  status: string;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
}

const METHOD_LABELS: Record<string, string> = {
  wallet_connect: 'via wallet',
  card: 'via card',
  manual: 'manual verify',
  qr: 'via QR',
};

const METHOD_BADGES: Record<string, string> = {
  wallet_connect: 'VIA WALLET',
  card: 'VIA CARD',
  manual: 'MANUAL',
  qr: 'VIA QR',
};

function fmtAmount(amount: number | null): string {
  if (amount == null) return 'Variable';
  return `$${amount.toFixed(2)}`;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PayPanel({ address, jwt, balance, onSendMessage, onShowAddress }: PayPanelProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address || !jwt) { setLoading(false); return; }
    setLoading(true);
    const headers = { 'x-zklogin-jwt': jwt, 'x-sui-address': address };
    fetch('/api/payments', { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setPayments(Array.isArray(data) ? data : []))
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  }, [address, jwt]);

  const stats = useMemo(() => {
    const active = payments.filter((p) => p.status === 'active');
    const activeLinks = active.filter((p) => p.type === 'link').length;
    const activeInvoices = active.filter((p) => p.type === 'invoice').length;
    const paid = payments.filter((p) => p.status === 'paid');
    const received = paid.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const overdueCount = payments.filter((p) => p.status === 'overdue').length;
    const paidLinkCount = payments.filter((p) => p.type === 'link' && p.status === 'paid').length;
    return { activeLinks, activeInvoices, received, overdueCount, paidLinkCount };
  }, [payments]);

  const recentItems = useMemo(() => {
    return payments.map((p) => {
      const isPaid = p.status === 'paid';
      const isInvoice = p.type === 'invoice';
      const methodLabel = isPaid && p.paymentMethod ? METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod : null;
      const methodBadge = isPaid && p.paymentMethod ? METHOD_BADGES[p.paymentMethod] ?? p.paymentMethod.toUpperCase() : null;

      const titleParts = [
        p.label || (isInvoice ? 'Invoice' : 'Payment link'),
        isPaid ? `${fmtAmount(p.amount)} received` : fmtAmount(p.amount),
      ];

      const descParts = [
        `pay/${p.slug}`,
        methodLabel ?? (isPaid ? 'paid' : p.status),
        timeAgo(p.paidAt ?? p.createdAt),
        isPaid ? 'sitting in wallet' : null,
      ].filter(Boolean);

      return {
        id: p.id,
        isPaid,
        title: titleParts.join(' \u00B7 '),
        desc: descParts.join(' \u00B7 '),
        amount: p.amount != null ? `$${p.amount.toFixed(2)}` : null,
        methodBadge,
        prompt: isPaid
          ? `Show me the details of the ${fmtAmount(p.amount)} payment I received for ${p.label || 'this link'}`
          : `What is the status of my ${isInvoice ? 'invoice' : 'payment link'} for ${p.label || p.slug}?`,
        saveable: isPaid && (p.amount ?? 0) > 0,
      };
    });
  }, [payments]);

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-[18px]">
      {/* BalanceHero — same wrapper padding as the other panels. */}
      <div className="pt-5 pb-4">
        <BalanceHero
          total={balance.total}
          available={balance.cash}
          earning={balance.savings}
          size="lg"
        />
      </div>

      {/* 3-button header strip: + PAYMENT LINK / + INVOICE / QR. Mirrors the
          design's `gridTemplateColumns:'1fr 1fr auto'` row. */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <button
          type="button"
          onClick={() => onSendMessage('Create a payment link for $50 USDC \u2014 label it logo design work')}
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-inverse bg-fg-primary rounded-pill px-5 py-3.5 hover:opacity-90 active:scale-[0.99] transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          + Payment link
        </button>
        <button
          type="button"
          onClick={() => onSendMessage('Create an invoice for $500 for design work due May 1')}
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-primary bg-transparent border border-border-subtle rounded-pill px-5 py-3.5 hover:bg-surface-card hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          + Invoice
        </button>
        <button
          type="button"
          onClick={() =>
            onShowAddress
              ? onShowAddress()
              : onSendMessage('Show me my wallet address and QR code for receiving USDC')
          }
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary bg-transparent border border-border-subtle rounded-pill px-5 py-3.5 hover:bg-surface-card hover:text-fg-primary hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          QR
        </button>
      </div>

      {/* 4-up stat grid. Like Portfolio's stat row, each card is a single
          <button> so the entire surface is the click target. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          label="LINKS"
          value={String(stats.activeLinks)}
          sub={`active \u00B7 ${stats.paidLinkCount} paid`}
          onClick={() => onSendMessage('Show me all my active payment links and their status')}
        />
        <StatCard
          label="INVOICES"
          value={String(stats.activeInvoices)}
          sub={`active \u00B7 ${stats.overdueCount} overdue`}
          warn={stats.overdueCount > 0}
          onClick={() => onSendMessage('Show me all my invoices and their payment status')}
        />
        <StatCard
          label="RECEIVED"
          value={fmtUsd(stats.received)}
          sub="total via links + invoices"
          accent={stats.received > 0}
          onClick={() => onSendMessage('How much have I received via payment links and invoices?')}
        />
        <StatCard
          label="API SPEND"
          value="$0.00"
          sub="no MPP services this month"
          onClick={() => onSendMessage('Show me my API spending breakdown — what services have I paid for today?')}
        />
      </div>

      {/* WHERE YOUR INCOME GOES — green tinted card, only shown when there
          are paid payments to act on. Pre-dark-mode this used literal
          `rgba(40,128,52,...)` which happens to be `--g600` (= our
          `--success-solid` in light) at 6%/30% alpha. Tailwind v4's
          slash-opacity on the semantic token reproduces light exactly and
          auto-promotes to the brighter `--g400` accent in dark. */}
      {stats.received > 0 && (
        <section
          aria-labelledby="pay-income-card-heading"
          className="rounded-md border bg-success-solid/[0.06] border-success-solid/30 p-4"
        >
          <h3
            id="pay-income-card-heading"
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-success-solid mb-2"
          >
            Where your income goes
          </h3>
          <p className="text-[13px] text-fg-secondary leading-[1.5] mb-3.5">
            Every payment received lands in your wallet immediately. Audric then offers to save it,
            send it onward, or hold it as working capital &mdash; your choice, one tap.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSendMessage(`Save my ${fmtUsd(stats.received)} received payment into NAVI savings`)}
              className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary bg-transparent border border-border-subtle rounded-pill px-3.5 py-2 hover:bg-surface-card hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              Save {fmtUsd(stats.received)} &rsaquo;
            </button>
            <button
              type="button"
              onClick={() => onSendMessage(`Send my ${fmtUsd(stats.received)} received payment onward to a contact or wallet`)}
              className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary bg-transparent border border-border-subtle rounded-pill px-3.5 py-2 hover:bg-surface-card hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              Send &rsaquo;
            </button>
            <button
              type="button"
              onClick={() => onSendMessage(`Keep my ${fmtUsd(stats.received)} received payment in wallet as working capital`)}
              className="inline-flex items-center font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary bg-transparent border border-border-subtle rounded-pill px-3.5 py-2 hover:bg-surface-card hover:border-border-strong hover:text-fg-primary transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              Keep
            </button>
          </div>
        </section>
      )}

      {/* RECENT — list of payment links / invoices. */}
      <section aria-labelledby="pay-recent-heading">
        <h3
          id="pay-recent-heading"
          className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2"
        >
          Recent
        </h3>

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[60px] rounded-md border border-border-subtle bg-surface-sunken animate-pulse"
              />
            ))}
          </div>
        ) : recentItems.length === 0 ? (
          <div className="rounded-md border border-border-subtle bg-surface-sunken p-6 text-center space-y-3">
            <p className="text-sm text-fg-secondary">No payment activity yet</p>
            <button
              type="button"
              onClick={() => onSendMessage('Create a payment link')}
              className="inline-flex items-center gap-1.5 h-[30px] px-3.5 rounded-pill border border-border-subtle bg-transparent font-mono text-[10px] leading-[14px] tracking-[0.1em] uppercase text-fg-secondary hover:bg-surface-card hover:border-border-strong hover:text-fg-primary transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              Create your first link &rsaquo;
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3.5 rounded-md border border-border-subtle bg-surface-sunken hover:border-border-strong transition"
              >
                <button
                  type="button"
                  onClick={() => onSendMessage(item.prompt)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:underline"
                  aria-label={item.title}
                >
                  <span
                    aria-hidden="true"
                    className={`shrink-0 inline-flex items-center justify-center w-4 ${
                      item.isPaid ? 'text-success-solid' : 'text-fg-muted'
                    }`}
                  >
                    {item.isPaid ? <Icon name="check" size={14} /> : <Icon name="link" size={14} />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14px] text-fg-primary truncate">{item.title}</div>
                    <div className="font-mono text-[10px] tracking-[0.06em] text-fg-muted mt-1 truncate">
                      {item.desc}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {item.methodBadge && <Tag tone="green">{item.methodBadge}</Tag>}
                  {item.saveable && (
                    <button
                      type="button"
                      onClick={() => onSendMessage(`Save my ${item.amount} from this payment into NAVI savings`)}
                      className="inline-flex items-center rounded-xs px-1.5 py-px font-mono text-[9px] leading-[14px] uppercase tracking-[0.1em] whitespace-nowrap select-none bg-surface-sunken text-fg-secondary border border-border-subtle hover:bg-surface-card hover:text-fg-primary hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                    >
                      Save it &rsaquo;
                    </button>
                  )}
                  <span aria-hidden="true" className="text-fg-muted">
                    <Icon name="chevron-right" size={14} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  warn,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  warn?: boolean;
  onClick: () => void;
}) {
  const valueColor = warn
    ? 'text-warning-solid'
    : accent
      ? 'text-success-solid'
      : 'text-fg-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-md border border-border-subtle bg-surface-sunken p-[14px] hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
    >
      <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">{label}</div>
      <div className={`text-[22px] mt-2.5 tracking-[-0.02em] ${valueColor}`}>{value}</div>
      <div className="text-[11px] text-fg-muted mt-1">{sub}</div>
    </button>
  );
}
