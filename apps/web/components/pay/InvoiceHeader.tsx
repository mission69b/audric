'use client';

// [PHASE 12] InvoiceHeader — re-skin the invoice header rendered inside the
// /pay/[slug] receipt for `type === 'invoice'` payments.
//
// Behavior preservation: identical prop surface (label, amount, currency,
// lineItems, senderName, recipientName, recipientEmail, dueDate, createdAt,
// overdue). No data fetches, no hooks — pure presentational.
//
// Visual updates:
//   • Replaced legacy `red-400` overdue tag with the semantic error tokens
//     (`text-error-fg`, `bg-error-bg`, `border-error-border`).
//   • Serif amount, mono eyebrows, hairline divider for line items.

interface LineItem {
  description: string;
  amount: number;
  quantity?: number;
}

interface InvoiceHeaderProps {
  label: string;
  amount: number;
  currency: string;
  lineItems: LineItem[];
  senderName: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  dueDate: string | null;
  createdAt: string;
  overdue: boolean;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InvoiceHeader({
  label,
  amount,
  currency,
  lineItems,
  senderName,
  recipientName,
  recipientEmail,
  dueDate,
  createdAt,
  overdue,
}: InvoiceHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Date + status */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-fg-muted">
          {new Date(createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        {overdue ? (
          <span className="font-mono text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-xs bg-error-bg text-error-fg border border-error-border">
            Overdue
          </span>
        ) : (
          <span className="font-mono text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-xs bg-surface-sunken text-fg-secondary border border-border-subtle">
            Invoice
          </span>
        )}
      </div>

      {/* Title + amount */}
      <div>
        <h1 className="text-[15px] font-medium text-fg-primary mb-1.5">{label}</h1>
        <div className="font-serif text-[32px] leading-tight tracking-[-0.02em] text-fg-primary">
          ${fmtUsd(amount)}
          <span className="font-mono text-[12px] tracking-[0.06em] uppercase text-fg-muted ml-2">
            {currency}
          </span>
        </div>
      </div>

      {/* Line items */}
      {lineItems.length > 0 && (
        <div className="border-t border-border-subtle pt-3 space-y-2">
          {lineItems.map((item, i) => (
            <div key={i} className="flex justify-between font-mono text-[11px]">
              <span className="text-fg-primary">
                {item.description}
                {item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''}
              </span>
              <span className="text-fg-secondary">
                ${fmtUsd(item.amount * (item.quantity ?? 1))}
              </span>
            </div>
          ))}
          <div className="flex justify-between font-mono text-[11px] pt-2 border-t border-border-subtle">
            <span className="text-fg-primary font-medium">Total</span>
            <span className="text-fg-primary font-medium">${fmtUsd(amount)}</span>
          </div>
        </div>
      )}

      {/* Parties + due date */}
      <div className="space-y-2">
        {senderName && (
          <div className="flex justify-between font-mono text-[11px]">
            <span className="text-fg-muted">From</span>
            <span className="text-fg-primary">{senderName}</span>
          </div>
        )}
        {recipientName && (
          <div className="flex justify-between font-mono text-[11px]">
            <span className="text-fg-muted">Bill to</span>
            <span className="text-fg-primary">
              {recipientName}
              {recipientEmail ? ` (${recipientEmail})` : ''}
            </span>
          </div>
        )}
        {dueDate && (
          <div className="flex justify-between font-mono text-[11px]">
            <span className="text-fg-muted">Due</span>
            <span className={overdue ? 'text-error-fg' : 'text-fg-primary'}>
              {new Date(dueDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
