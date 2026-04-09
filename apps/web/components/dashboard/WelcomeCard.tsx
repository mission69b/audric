'use client';

interface WelcomeCardProps {
  usdcBalance: number;
  hasSavings: boolean;
  onSave: () => void;
  onAsk: () => void;
  onDismiss: () => void;
}

function FeatureRow({ icon, label, description }: { icon: string; label: string; description: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-base leading-none mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground font-medium">{label}</span>
        <p className="text-xs text-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function WelcomeCard({ usdcBalance, hasSavings, onSave, onAsk, onDismiss }: WelcomeCardProps) {
  const hasBalance = usdcBalance > 0.01;

  return (
    <div className="rounded-xl border border-border bg-surface shadow-[var(--shadow-card)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <p className="text-xs text-muted font-medium tracking-wide">
          👋 Welcome to Audric
        </p>
        <button
          onClick={onDismiss}
          className="text-dim hover:text-foreground transition p-1 -m-1 rounded"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Intro */}
      <div className="px-4 pb-3">
        <h2 className="text-lg font-display text-foreground leading-snug mb-1">
          Your AI copilot for money on Sui.
        </h2>
        <p className="text-xs text-muted leading-relaxed">
          You signed in with Google — no seed phrase, no extension.
          That&apos;s your <span className="text-foreground font-medium">Audric Passport</span>. A wallet you already own.
        </p>
      </div>

      {/* Features */}
      <div className="px-4 pb-3 space-y-0.5">
        {hasBalance && !hasSavings && (
          <div className="bg-background rounded-lg px-3 py-2 mb-2">
            <p className="text-xs text-muted">
              You have <span className="text-foreground font-medium font-mono">${usdcBalance.toFixed(2)}</span> USDC to explore
            </p>
          </div>
        )}
        {hasSavings && (
          <div className="bg-background rounded-lg px-3 py-2 mb-2">
            <p className="text-xs text-muted">
              You&apos;re already earning yield. Explore what else Audric can do.
            </p>
          </div>
        )}
        <FeatureRow icon="💰" label="Save" description="Earn 4.85% APY while you sleep" />
        <FeatureRow icon="💱" label="Swap" description="Trade tokens in one message" />
        <FeatureRow icon="💸" label="Send" description="Pay anyone, anywhere" />
        <FeatureRow icon="🤖" label="Ask" description="Translate, weather, images — Audric pays" />
      </div>

      {/* CTAs */}
      <div className="px-4 pb-4 flex gap-2">
        {hasBalance && !hasSavings ? (
          <button
            onClick={onSave}
            className="flex-1 py-2.5 px-4 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            Save ${usdcBalance < 1 ? usdcBalance.toFixed(2) : Math.floor(usdcBalance).toString()} →
          </button>
        ) : null}
        <button
          onClick={onAsk}
          className={`${hasBalance && !hasSavings ? 'flex-1' : 'w-full'} py-2.5 px-4 border border-border text-foreground rounded-lg text-sm font-medium hover:border-foreground/40 hover:bg-surface-bright active:scale-[0.98] transition`}
        >
          Ask Audric →
        </button>
      </div>
    </div>
  );
}
