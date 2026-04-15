'use client';

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
        <span className="text-xs font-mono text-dim">
          {new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        {overdue ? (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-400/10 text-red-400">Overdue</span>
        ) : (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-foreground/10 text-foreground">Invoice</span>
        )}
      </div>

      {/* Title + amount */}
      <div>
        <h1 className="text-lg font-medium text-foreground mb-1">{label}</h1>
        <div className="text-3xl font-semibold font-mono text-foreground">
          ${fmtUsd(amount)}
          <span className="text-sm text-dim ml-1">{currency}</span>
        </div>
      </div>

      {/* Line items */}
      {lineItems.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2">
          {lineItems.map((item, i) => (
            <div key={i} className="flex justify-between text-xs font-mono">
              <span className="text-foreground">
                {item.description}
                {item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''}
              </span>
              <span className="text-dim">${fmtUsd(item.amount * (item.quantity ?? 1))}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs font-mono pt-2 border-t border-border/50">
            <span className="text-foreground font-medium">Total</span>
            <span className="text-foreground font-medium">${fmtUsd(amount)}</span>
          </div>
        </div>
      )}

      {/* Parties + due date */}
      <div className="space-y-2">
        {senderName && (
          <div className="flex justify-between text-xs font-mono">
            <span className="text-dim">From</span>
            <span className="text-foreground">{senderName}</span>
          </div>
        )}
        {recipientName && (
          <div className="flex justify-between text-xs font-mono">
            <span className="text-dim">Bill to</span>
            <span className="text-foreground">
              {recipientName}
              {recipientEmail ? ` (${recipientEmail})` : ''}
            </span>
          </div>
        )}
        {dueDate && (
          <div className="flex justify-between text-xs font-mono">
            <span className="text-dim">Due</span>
            <span className={overdue ? 'text-red-400' : 'text-foreground'}>
              {new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
