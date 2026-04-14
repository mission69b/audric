'use client';

interface StorePanelProps {
  onSendMessage?: (text: string) => void;
}

const SYNC_PRODUCTS = [
  {
    id: 'art',
    emoji: '🎨',
    title: 'AI Art Packs',
    description: 'Generate and sell curated image collections. Stability AI powers the generation.',
    example: '"Create an AI art pack — 10 pieces, Japanese woodblock style"',
  },
  {
    id: 'tshirts',
    emoji: '👕',
    title: 'T-Shirt Designs',
    description: 'AI-generated apparel designs, ready to list with a payment link.',
    example: '"Design a minimal crypto t-shirt in black and white"',
  },
  {
    id: 'prompts',
    emoji: '💬',
    title: 'Prompt Packs',
    description: 'Curated AI prompt libraries. Package your expertise as a product.',
    example: '"Create a prompt pack for product photography"',
  },
  {
    id: 'guides',
    emoji: '📖',
    title: 'Guides & Tutorials',
    description: 'Written content products — how-tos, playbooks, checklists.',
    example: '"Write a guide on DeFi yield farming for beginners"',
  },
  {
    id: 'cards',
    emoji: '🃏',
    title: 'Digital Cards',
    description: 'Collectible digital cards — art, sports, memes. Set edition sizes.',
    example: '"Create a set of 5 cyberpunk trading cards"',
  },
];

const ASYNC_PRODUCTS = [
  {
    id: 'music',
    emoji: '🎵',
    title: 'Music & Audio',
    description: 'AI-composed tracks and sound packs. Coming with Phase 5 audio models.',
  },
  {
    id: 'video',
    emoji: '🎬',
    title: 'Video Content',
    description: 'Short-form AI video clips and animations. Coming with Phase 5 video models.',
  },
];

export function StorePanel({ onSendMessage }: StorePanelProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-foreground">Store</h2>
        <button
          onClick={() => onSendMessage?.('Create an AI art pack — 10 pieces, minimal abstract style')}
          className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
        >
          Create &amp; List &rarr;
        </button>
      </div>

      <p className="text-sm text-muted leading-relaxed">
        Create digital products through conversation and sell them for USDC. Every sale is real income — deposited directly to your wallet.
      </p>

      {/* Available now */}
      <div className="space-y-3">
        <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Available now</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SYNC_PRODUCTS.map((product) => (
            <button
              key={product.id}
              onClick={() => onSendMessage?.(product.example)}
              className="rounded-lg border border-border bg-surface p-4 text-left hover:border-border-bright transition group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{product.emoji}</span>
                <span className="text-sm font-medium text-foreground">{product.title}</span>
              </div>
              <p className="text-[11px] text-dim leading-relaxed mb-2">{product.description}</p>
              <p className="font-mono text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                Try it &rarr;
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Coming Phase 5 */}
      <div className="space-y-3">
        <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-dim">Coming Phase 5</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ASYNC_PRODUCTS.map((product) => (
            <div
              key={product.id}
              className="rounded-lg border border-border bg-surface p-4 opacity-50"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{product.emoji}</span>
                  <span className="text-sm font-medium text-foreground">{product.title}</span>
                </div>
                <span className="font-mono text-[8px] tracking-[0.12em] uppercase text-dim bg-border px-1.5 py-0.5 rounded">
                  Soon
                </span>
              </div>
              <p className="text-[11px] text-dim leading-relaxed">{product.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">How it works</h3>
        <div className="space-y-2 text-[11px] text-dim leading-relaxed">
          <p>1. Tell Audric what to create &mdash; art, designs, prompts, guides, or cards.</p>
          <p>2. Review the preview and set your price in USDC.</p>
          <p>3. Audric generates a payment link and lists it on your storefront.</p>
          <p>4. Buyers pay in USDC. You earn 92% (8% platform fee).</p>
        </div>
      </div>
    </div>
  );
}
