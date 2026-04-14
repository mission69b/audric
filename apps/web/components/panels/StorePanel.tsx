'use client';

export function StorePanel() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <h2 className="font-heading text-lg text-foreground">Store</h2>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-4xl mb-4">🏪</span>
        <p className="text-sm text-muted mb-2">Agent marketplace coming soon</p>
        <p className="text-xs text-dim max-w-md leading-relaxed mb-6">
          Buy and sell digital goods, accept crypto payments for your services,
          and manage your listings — all through conversation.
        </p>
        <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim bg-surface border border-border px-3 py-1.5 rounded-full">
          Phase 5
        </span>
      </div>
    </div>
  );
}
