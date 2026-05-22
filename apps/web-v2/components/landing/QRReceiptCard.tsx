// [PHASE 13] Marketing — sticky right-side QR receipt card used by the
// PaySection split layout. Mirrors the `.qr-card` block from
// `audric-marketing/index.html`.
//
// Visuals: bordered card with a sunken inner panel containing serif amount,
// faux QR (inline SVG), recipient row, two pill-CTAs, and a pulsing
// "Checking for payment…" indicator.
//
// This is purely illustrative for the marketing page — no real wallet
// connection. The buttons are static visuals (matching the prototype).

interface QRReceiptCardProps {
  amount: string;
  currency: string;
  payLabel: string;
  recipientShort: string;
}

export function QRReceiptCard({
  amount,
  currency,
  recipientShort,
  payLabel,
}: QRReceiptCardProps) {
  return (
    <div className="lg:sticky lg:top-24 rounded-md border border-border-subtle bg-surface-card p-7 flex flex-col items-center gap-3.5 shadow-[0_1px_0_rgba(0,0,0,0.02),0_20px_40px_-20px_rgba(0,0,0,0.10)]">
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] uppercase text-fg-secondary">
        <span
          aria-hidden="true"
          className="w-2 h-2 bg-fg-primary rounded-xs rotate-45"
        />
        Audric Pay
      </div>

      <div className="bg-surface-sunken border border-border-subtle rounded-md p-6 w-full flex flex-col items-center gap-3.5">
        <div className="text-center">
          <div className="font-serif text-[42px] leading-none tracking-[-0.02em] text-fg-primary tabular-nums">
            {amount}
          </div>
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-fg-secondary mt-1.5">
            {currency}
          </div>
        </div>

        <div className="bg-surface-card p-2.5 rounded-xs border border-border-subtle relative">
          <FauxQr />
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="w-6 h-6 bg-fg-primary text-fg-inverse rounded-xs grid place-items-center text-[11px]">
              ◈
            </div>
          </div>
        </div>

        <div className="w-full flex items-center justify-between font-mono text-[11px] tracking-[0.06em] text-fg-secondary pt-0.5">
          <span>To</span>
          <b className="text-fg-primary font-medium">{recipientShort}</b>
        </div>

        <button
          className="w-full h-12 rounded-pill bg-fg-primary text-fg-inverse font-mono text-[11px] tracking-[0.12em] uppercase hover:opacity-90 transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          type="button"
        >
          {payLabel}
        </button>
        <button
          className="w-full h-12 rounded-pill border border-border-subtle bg-transparent text-fg-primary font-mono text-[11px] tracking-[0.12em] uppercase hover:bg-surface-sunken transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          type="button"
        >
          Copy address
        </button>

        <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary">
          I already sent payment →
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.1em] uppercase text-success-fg">
          <span className="w-2 h-2 rounded-full bg-success-solid animate-pulse" />
          Checking for payment&hellip;
        </div>
      </div>

      <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-fg-muted text-center mt-0.5">
        Powered by Audric — Your money, handled.
      </div>
    </div>
  );
}

// Faux QR — visually convincing but not a real code. Pulled from the
// reference HTML's hand-rolled SVG (29×29 module grid, 3 finder squares
// + scattered noise modules).
function FauxQr() {
  return (
    <svg
      aria-label="QR code (illustrative)"
      height="180"
      shapeRendering="crispEdges"
      viewBox="0 0 29 29"
      width="180"
    >
      <rect className="fill-surface-card" height="29" width="29" />
      <g className="fill-fg-primary">
        {/* Finder squares: TL / TR / BL */}
        <rect height="1" width="7" x="0" y="0" />
        <rect height="1" width="7" x="0" y="6" />
        <rect height="5" width="1" x="0" y="1" />
        <rect height="5" width="1" x="6" y="1" />
        <rect height="3" width="3" x="2" y="2" />
        <rect height="1" width="7" x="22" y="0" />
        <rect height="1" width="7" x="22" y="6" />
        <rect height="5" width="1" x="22" y="1" />
        <rect height="5" width="1" x="28" y="1" />
        <rect height="3" width="3" x="24" y="2" />
        <rect height="1" width="7" x="0" y="22" />
        <rect height="1" width="7" x="0" y="28" />
        <rect height="5" width="1" x="0" y="23" />
        <rect height="5" width="1" x="6" y="23" />
        <rect height="3" width="3" x="2" y="24" />
        {/* Noise body */}
        <rect height="1" width="1" x="9" y="2" />
        <rect height="1" width="1" x="11" y="2" />
        <rect height="1" width="2" x="14" y="2" />
        <rect height="1" width="1" x="18" y="2" />
        <rect height="1" width="1" x="20" y="2" />
        <rect height="1" width="1" x="10" y="4" />
        <rect height="1" width="2" x="13" y="4" />
        <rect height="1" width="1" x="17" y="4" />
        <rect height="1" width="2" x="19" y="4" />
        <rect height="1" width="2" x="9" y="6" />
        <rect height="1" width="1" x="12" y="6" />
        <rect height="1" width="1" x="15" y="6" />
        <rect height="1" width="2" x="18" y="6" />
        <rect height="1" width="1" x="2" y="8" />
        <rect height="1" width="1" x="4" y="8" />
        <rect height="1" width="2" x="7" y="8" />
        <rect height="1" width="1" x="11" y="8" />
        <rect height="1" width="3" x="14" y="8" />
        <rect height="1" width="1" x="19" y="8" />
        <rect height="1" width="1" x="22" y="8" />
        <rect height="1" width="2" x="25" y="8" />
        <rect height="1" width="2" x="0" y="10" />
        <rect height="1" width="1" x="4" y="10" />
        <rect height="1" width="1" x="6" y="10" />
        <rect height="1" width="2" x="9" y="10" />
        <rect height="1" width="1" x="13" y="10" />
        <rect height="1" width="1" x="16" y="10" />
        <rect height="1" width="2" x="18" y="10" />
        <rect height="1" width="1" x="22" y="10" />
        <rect height="1" width="1" x="25" y="10" />
        <rect height="1" width="1" x="27" y="10" />
        <rect height="1" width="1" x="1" y="12" />
        <rect height="1" width="2" x="3" y="12" />
        <rect height="1" width="1" x="7" y="12" />
        <rect height="1" width="1" x="10" y="12" />
        <rect height="1" width="2" x="12" y="12" />
        <rect height="1" width="1" x="17" y="12" />
        <rect height="1" width="1" x="20" y="12" />
        <rect height="1" width="2" x="23" y="12" />
        <rect height="1" width="2" x="27" y="12" />
        <rect height="1" width="1" x="0" y="14" />
        <rect height="1" width="1" x="2" y="14" />
        <rect height="1" width="2" x="5" y="14" />
        <rect height="1" width="1" x="9" y="14" />
        <rect height="1" width="2" x="11" y="14" />
        <rect height="1" width="1" x="15" y="14" />
        <rect height="1" width="1" x="18" y="14" />
        <rect height="1" width="2" x="21" y="14" />
        <rect height="1" width="1" x="26" y="14" />
        <rect height="1" width="2" x="1" y="16" />
        <rect height="1" width="1" x="4" y="16" />
        <rect height="1" width="1" x="6" y="16" />
        <rect height="1" width="2" x="9" y="16" />
        <rect height="1" width="1" x="13" y="16" />
        <rect height="1" width="2" x="16" y="16" />
        <rect height="1" width="1" x="19" y="16" />
        <rect height="1" width="1" x="22" y="16" />
        <rect height="1" width="2" x="25" y="16" />
        <rect height="1" width="1" x="0" y="18" />
        <rect height="1" width="1" x="3" y="18" />
        <rect height="1" width="2" x="5" y="18" />
        <rect height="1" width="1" x="8" y="18" />
        <rect height="1" width="1" x="11" y="18" />
        <rect height="1" width="2" x="14" y="18" />
        <rect height="1" width="1" x="18" y="18" />
        <rect height="1" width="2" x="20" y="18" />
        <rect height="1" width="1" x="24" y="18" />
        <rect height="1" width="1" x="27" y="18" />
        <rect height="1" width="2" x="2" y="20" />
        <rect height="1" width="1" x="6" y="20" />
        <rect height="1" width="2" x="8" y="20" />
        <rect height="1" width="1" x="11" y="20" />
        <rect height="1" width="1" x="13" y="20" />
        <rect height="1" width="1" x="16" y="20" />
        <rect height="1" width="2" x="19" y="20" />
        <rect height="1" width="1" x="23" y="20" />
        <rect height="1" width="2" x="25" y="20" />
        <rect height="1" width="1" x="8" y="22" />
        <rect height="1" width="2" x="10" y="22" />
        <rect height="1" width="1" x="13" y="22" />
        <rect height="1" width="2" x="15" y="22" />
        <rect height="1" width="1" x="19" y="22" />
        <rect height="1" width="1" x="22" y="22" />
        <rect height="1" width="1" x="25" y="22" />
        <rect height="1" width="1" x="27" y="22" />
        <rect height="1" width="2" x="9" y="24" />
        <rect height="1" width="1" x="12" y="24" />
        <rect height="1" width="1" x="14" y="24" />
        <rect height="1" width="2" x="17" y="24" />
        <rect height="1" width="1" x="20" y="24" />
        <rect height="1" width="2" x="22" y="24" />
        <rect height="1" width="1" x="26" y="24" />
        <rect height="1" width="1" x="8" y="26" />
        <rect height="1" width="2" x="11" y="26" />
        <rect height="1" width="1" x="15" y="26" />
        <rect height="1" width="1" x="17" y="26" />
        <rect height="1" width="2" x="20" y="26" />
        <rect height="1" width="1" x="24" y="26" />
        <rect height="1" width="2" x="26" y="26" />
        <rect height="1" width="2" x="9" y="28" />
        <rect height="1" width="1" x="13" y="28" />
        <rect height="1" width="2" x="15" y="28" />
        <rect height="1" width="1" x="19" y="28" />
        <rect height="1" width="1" x="22" y="28" />
        <rect height="1" width="1" x="25" y="28" />
        <rect height="1" width="1" x="27" y="28" />
      </g>
    </svg>
  );
}
