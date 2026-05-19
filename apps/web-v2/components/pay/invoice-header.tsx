"use client";

/**
 * InvoiceHeader — invoice top-card rendered inside `/pay/[slug]` for
 * `type === 'invoice'` payments. Verbatim port from
 * `apps/web/components/pay/InvoiceHeader.tsx` for Session 4 Pay rebuild.
 *
 * Pure presentational — no hooks, no fetches.
 *
 * Note on the broader invoice product: per Session 4 audit, a follow-up
 * "deprecate invoice as a distinct product feature" mini-SPEC is queued
 * for after Phase 6. Until then this component renders the legacy
 * invoice header.
 */

interface LineItem {
  amount: number;
  description: string;
  quantity?: number;
}

interface InvoiceHeaderProps {
  amount: number;
  createdAt: string;
  currency: string;
  dueDate: string | null;
  label: string;
  lineItems: LineItem[];
  overdue: boolean;
  recipientEmail: string | null;
  recipientName: string | null;
  senderName: string | null;
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-fg-muted">
          {new Date(createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        {overdue ? (
          <span className="rounded-xs border border-error-border bg-error-bg px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-error-fg">
            Overdue
          </span>
        ) : (
          <span className="rounded-xs border border-border-subtle bg-surface-sunken px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-fg-secondary">
            Invoice
          </span>
        )}
      </div>

      <div>
        <h1 className="mb-1.5 text-[15px] font-medium text-fg-primary">
          {label}
        </h1>
        <div className="font-serif text-[32px] leading-tight tracking-[-0.02em] text-fg-primary">
          ${fmtUsd(amount)}
          <span className="ml-2 font-mono text-[12px] uppercase tracking-[0.06em] text-fg-muted">
            {currency}
          </span>
        </div>
      </div>

      {lineItems.length > 0 && (
        <div className="space-y-2 border-border-subtle border-t pt-3">
          {lineItems.map((item, i) => {
            // Invoice line items are server-issued read-only data displayed
            // in a fixed order; no insert / delete / reorder UI exists.
            // Descriptions can legitimately repeat (e.g. "Hour of work" x N),
            // so include the index alongside the description, quantity, and
            // amount to ensure the React key is stable + unique across the
            // (rare) duplicate-line case.
            const key = `${i}-${item.description}-${item.quantity ?? 1}-${item.amount}`;
            return (
              <div
                className="flex justify-between font-mono text-[11px]"
                key={key}
              >
                <span className="text-fg-primary">
                  {item.description}
                  {item.quantity && item.quantity > 1
                    ? ` x${item.quantity}`
                    : ""}
                </span>
                <span className="text-fg-secondary">
                  ${fmtUsd(item.amount * (item.quantity ?? 1))}
                </span>
              </div>
            );
          })}
          <div className="flex justify-between border-border-subtle border-t pt-2 font-mono text-[11px]">
            <span className="font-medium text-fg-primary">Total</span>
            <span className="font-medium text-fg-primary">
              ${fmtUsd(amount)}
            </span>
          </div>
        </div>
      )}

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
              {recipientEmail ? ` (${recipientEmail})` : ""}
            </span>
          </div>
        )}
        {dueDate && (
          <div className="flex justify-between font-mono text-[11px]">
            <span className="text-fg-muted">Due</span>
            <span className={overdue ? "text-error-fg" : "text-fg-primary"}>
              {new Date(dueDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
