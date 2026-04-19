// [PHASE 13] Marketing — landing-page hero.
// Two-column on desktop: left = headline / lede / CTAs, right = chat widget.
//
// Behavior preserved from the old hero:
//   • "Sign in with Google →" CTA invokes `useZkLogin().login`
//   • "How it works ↓" jumps to the `#how` anchor
//   • Auth-redirect ('authenticated' → /new) lives in the page-level wrapper

'use client';

import { useZkLogin } from '@/components/auth/useZkLogin';
import { HeroChatWidget } from './HeroChatWidget';

export function HeroSection() {
  const { login } = useZkLogin();

  return (
    <section className="px-8">
      <div className="mx-auto max-w-[1120px] grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center py-14 lg:py-24">
        <div>
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-fg-secondary mb-5">
            Conversational finance
          </p>
          <h1 className="font-serif font-medium text-[56px] sm:text-[64px] lg:text-[76px] leading-[1] tracking-[-0.035em] text-fg-primary mb-6">
            Your money,
            <br />
            <em className="italic font-medium">handled.</em>
          </h1>
          <p className="text-[17px] text-fg-secondary leading-relaxed max-w-[420px] mb-9">
            Sign in with Google. Chat with your money. Earn yield, send USDC, borrow — all by
            conversation. No seed phrase.
          </p>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={login}
              className="inline-flex items-center gap-2 bg-fg-primary text-fg-inverse px-4 py-2.5 rounded-xs font-mono text-[11px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
            >
              Sign in with Google →
            </button>
            <a
              href="#how"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xs border border-border-subtle bg-surface-page text-fg-primary font-mono text-[11px] tracking-[0.08em] uppercase transition hover:border-border-strong"
            >
              How it works ↓
            </a>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <HeroChatWidget />
        </div>
      </div>
    </section>
  );
}
