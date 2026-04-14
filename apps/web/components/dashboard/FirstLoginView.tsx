'use client';

import { InputBar } from './InputBar';

interface FirstLoginViewProps {
  greeting: string;
  onSend: (prompt: string) => void;
  onSave: () => void;
  onAsk: () => void;
  onDismiss: () => void;
  usdcBalance: number;
  hasSavings: boolean;
}

const FIRST_LOGIN_CHIPS = [
  { label: 'Balance', prompt: 'What is my current balance and portfolio?', icon: '💰' },
  { label: 'Save', prompt: 'Save $50 USDC into NAVI savings at the current APY', icon: '🏦' },
  { label: 'Receive', prompt: 'Show me my wallet address and QR code for receiving USDC', icon: '📥' },
  { label: 'Tour', prompt: 'What can you do? Give me a full tour of Audric', icon: '🗺️' },
];

export function FirstLoginView({
  greeting,
  onSend,
  onDismiss,
}: FirstLoginViewProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 -mt-4">
      <p className="font-heading text-lg text-foreground mb-1">{greeting}</p>
      <p className="text-sm text-muted mb-4 text-center max-w-md">
        Welcome to Audric — your conversational finance agent on Sui.
      </p>

      {/* zkLogin moat callout */}
      <div className="rounded-lg border border-border bg-surface px-4 py-3 mb-8 max-w-md text-center">
        <p className="text-xs text-muted leading-relaxed">
          <span className="text-foreground font-medium">No seed phrase, ever</span> — your Google login controls your Sui wallet via zkLogin.
          Your keys never leave your device.
        </p>
      </div>

      <div className="w-full max-w-2xl mb-6">
        <InputBar
          onSubmit={(text) => {
            onDismiss();
            onSend(text);
          }}
          placeholder="Ask anything..."
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {FIRST_LOGIN_CHIPS.map((chip) => (
          <button
            key={chip.label}
            onClick={() => {
              onDismiss();
              onSend(chip.prompt);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border bg-background text-muted hover:text-foreground hover:border-border-bright font-mono text-[11px] tracking-[0.08em] uppercase transition active:scale-[0.95]"
          >
            <span className="text-sm leading-none">{chip.icon}</span>
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
