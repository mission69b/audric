// [PHASE 13] Marketing — "Get paid with a link." section.
// Split layout: left = chat artifact (balance + tool-call card + rationale + pills),
// right = sticky QR receipt card. The QR card sticks on `lg+`.

import { QRReceiptCard } from './QRReceiptCard';

export function PaySection() {
  return (
    <section id="pay" className="px-8 py-20 border-t border-border-subtle">
      <div className="mx-auto max-w-[1120px]">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary mb-4">
          Audric Pay
        </p>
        <h2 className="font-serif font-medium text-[40px] sm:text-[46px] leading-[1.02] tracking-[-0.03em] text-fg-primary max-w-[720px] mb-5">
          Get paid with a link.
          <br />
          Anyone can pay — no account.
        </h2>
        <p className="text-[16px] text-fg-secondary leading-relaxed max-w-[580px] mb-10">
          Ask Audric to generate a payment link. Share it anywhere. The recipient scans a QR or
          taps to pay. USDC lands in your Passport in under a second — free, global, instant.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
          <PayChat />
          <QRReceiptCard
            amount="$5.00"
            currency="USDC"
            recipientShort="0x7f2059…d2f6dc"
            payLabel="Pay $5.00 with wallet"
          />
        </div>
      </div>
    </section>
  );
}

// The chat artifact mirrors the `.pay-chat` block from the marketing
// reference. It's a static visualization of the user → tool-call → result
// pattern that powers Audric's payment-link tool.
function PayChat() {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-card p-5 flex flex-col gap-4">
      <div className="text-center pb-2.5 border-b border-border-subtle">
        <div className="font-serif font-medium text-[32px] tracking-[-0.02em] text-fg-primary tabular-nums">
          $111.67
        </div>
        <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mt-1">
          available $80 · earning $31
        </div>
      </div>

      <div className="flex items-center gap-2.5 justify-center font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
        <span className="flex-1 max-w-[60px] h-px bg-border-subtle" />
        Task initiated
        <span className="flex-1 max-w-[60px] h-px bg-border-subtle" />
      </div>

      <div className="self-end max-w-[70%] bg-fg-primary text-fg-inverse px-3.5 py-2 rounded-pill text-[13px]">
        Generate a payment link for $5
      </div>

      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary">
        <span className="w-3.5 h-3.5 rounded-full bg-success-solid text-fg-inverse grid place-items-center text-[9px] font-bold">
          ✓
        </span>
        Create payment link
      </div>

      <div className="rounded-md border border-border-subtle bg-surface-card overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-border-subtle font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted">
          Payment link created
        </div>
        <div className="px-3.5 py-3.5 flex flex-col gap-2.5">
          <div className="flex justify-between items-baseline">
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-fg-muted">
              Amount
            </span>
            <span className="font-mono font-medium text-[14px] text-fg-primary tabular-nums">
              5.00 USDC
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-sunken rounded-xs font-mono text-[11px]">
            <span className="flex-1 truncate text-fg-primary">https://audric.ai/pay/ghsAk6h4</span>
            <button
              type="button"
              className="border border-border-subtle px-2.5 py-1 rounded-xs font-mono text-[9px] tracking-[0.1em] uppercase bg-surface-card text-fg-primary hover:bg-surface-page transition"
            >
              Copy link
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 items-start text-[13px] text-fg-secondary leading-relaxed">
        <span aria-hidden="true" className="text-fg-muted shrink-0 mt-0.5">
          ✦
        </span>
        <span>
          Payment link created — <b className="text-fg-primary font-semibold">$5 USDC</b>, no
          expiry. Share it anywhere: text, email, Telegram, QR.
        </span>
      </div>
      <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted ml-5">
        36 tokens · 0.4s
      </div>

      <div className="flex gap-2.5 flex-wrap mt-2">
        {[
          'Invoices · Settle on-chain',
          '$0 fees · <1s',
          'No account required',
        ].map((label) => (
          <span
            key={label}
            className="border border-border-subtle px-3.5 py-2 rounded-pill font-mono text-[10px] tracking-[0.08em] uppercase text-fg-secondary"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
