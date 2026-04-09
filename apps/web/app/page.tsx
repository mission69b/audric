'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LandingNav } from '@/components/landing/LandingNav';
import { MockChatDemo } from '@/components/landing/MockChatDemo';
import { useZkLogin } from '@/components/auth/useZkLogin';

const PRODUCTS = [
  { icon: '◎', name: 'Save', desc: 'Earn 3–8% APY on USDC. Auto-compound rewards.' },
  { icon: '→', name: 'Send', desc: 'Instant transfers. Sub-second. No gas fees for you.' },
  { icon: '⊞', name: 'Credit', desc: 'Borrow against savings. Health factor alerts protect you.' },
  { icon: '⇌', name: 'Swap', desc: 'Convert tokens. Best-route via Cetus. 0.1% fee.' },
  { icon: '↙', name: 'Receive', desc: 'Payment links, QR codes, invoices. Accept USDC from anyone.', coming: true },
];

const PASSPORT_PILLARS = [
  { icon: '🪪', title: 'Identity', desc: 'Sign in with Google. Your Passport is a cryptographic wallet, created in 3 seconds. No seed phrase. Yours forever.' },
  { icon: '💰', title: 'Budget', desc: 'You set the cap. Audric spends only what you approve, only for features you\'ve enabled. Withdraw the rest anytime.' },
  { icon: '🔐', title: 'Security', desc: 'Every autonomous action uses a short-lived signed intent. Cryptographic guardrails on-chain — not app-layer promises.' },
  { icon: '⛓️', title: 'Yours', desc: 'Non-custodial. We cannot move your money. Every transaction is on Sui mainnet, verifiable by anyone, forever.' },
];

const COPILOT_FEATURES = [
  { icon: '☀️', title: 'Morning briefings', desc: 'Every morning — yield earned, APY, health factor, one suggested action.' },
  { icon: '🛡️', title: 'Health alerts', desc: 'Free. Always on. Warn at 1.8, critical at 1.3. We will never charge for protecting your money.' },
  { icon: '⏰', title: 'Scheduled actions', desc: '"Save $50 every Friday." 5 confirmations then fully autonomous. Always in control.' },
  { icon: '🔄', title: 'Auto-compound', desc: 'NAVX and vSUI rewards claimed and re-deposited as USDC automatically.' },
  { icon: '🎯', title: 'Savings goals', desc: 'Set a target. Audric tracks progress and nudges you when you fall behind.' },
  { icon: '📈', title: 'Rate monitoring', desc: 'USDC savings rate changes by more than 1%? You\'ll know within the hour.' },
];

const STORE_STEPS = [
  { num: '01', label: 'Create', title: '"Make me a lo-fi track called Midnight Rain."', desc: 'AI generates the song + cover art.' },
  { num: '02', label: 'List', title: '"Sell this for $3."', desc: 'Payment link created. Free preview — full track unlocks when they pay.' },
  { num: '03', label: 'Earn', title: '"You just earned $2.76."', desc: '92% to you, instant. audric.ai/you — no app needed to buy.' },
];

const STORE_TRUST = [
  { title: 'Permanent', desc: 'Files on Walrus. No expiry, no shutdowns.' },
  { title: 'Pay-to-unlock', desc: 'Seal gates access on-chain. No DRM needed.' },
  { title: 'Not our servers', desc: 'We can\'t delete your content. Ever.' },
];

const STORE_CHIPS = ['Music', 'Art', 'Ebooks', 'Templates', 'Courses', 'Merch'];

export default function LandingPage() {
  const router = useRouter();
  const { status, login } = useZkLogin();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/new');
  }, [status, router]);

  return (
    <div className="min-h-dvh bg-background">
      <LandingNav />

      {/* ── S1: Hero ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-12 sm:py-16 lg:py-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-5">
              Your money, handled.
            </p>
            <h1 className="text-[40px] sm:text-[52px] font-normal leading-[1.05] tracking-[-2px] text-foreground mb-5">
              Your money,<br />
              <em className="font-display italic font-normal">handled.</em>
            </h1>
            <p className="text-[13px] sm:text-[14px] text-muted leading-[1.7] max-w-[400px] mb-7">
              Sign in with Google. Chat with your money. Earn yield, send USDC, borrow — all by conversation. No seed phrase.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={login}
                className="bg-foreground text-background px-5 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
              >
                Sign in with Google →
              </button>
              <a
                href="#how"
                className="px-5 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase text-muted border border-border-bright transition hover:text-foreground hover:border-foreground"
              >
                How it works ↓
              </a>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <MockChatDemo />
          </div>
        </div>
      </section>

      {/* ── S2: How it works ── */}
      <section id="how" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
            How it works
          </p>
          <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-10">
            Three steps to your money.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border border-border">
            {[
              { num: '01', title: 'Sign in with Google', desc: 'No seed phrase. No wallet download. Your Audric Passport is ready in 3 seconds via zkLogin.' },
              { num: '02', title: 'Talk to your money', desc: 'Save, send, borrow, swap — just say what you need. Audric handles the transaction, gas, and complexity.' },
              { num: '03', title: 'Earn while you sleep', desc: 'Your USDC earns 3–8% APY, 24/7. Morning briefings tell you exactly what happened overnight.' },
            ].map((step) => (
              <div key={step.num} className="bg-background p-6 sm:p-7">
                <div className="font-mono text-[32px] font-medium text-border-bright mb-3">{step.num}</div>
                <div className="text-[15px] font-semibold text-foreground mb-2">{step.title}</div>
                <p className="text-[13px] text-muted leading-[1.7]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S3: Products ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
            Products
          </p>
          <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-10">
            Everything you need.
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-border border border-border">
            {PRODUCTS.map((p) => (
              <div
                key={p.name}
                className={`bg-surface p-5 text-center ${p.coming ? 'opacity-50' : ''}`}
              >
                <div className="text-[20px] mb-2">{p.icon}</div>
                <div className="text-[13px] font-semibold text-foreground mb-1">{p.name}</div>
                <p className="text-[11px] text-muted leading-[1.6]">{p.desc}</p>
                {p.coming && (
                  <span className="inline-block mt-2 font-mono text-[8px] tracking-[0.1em] uppercase text-dim border border-border rounded px-1.5 py-0.5">
                    Coming · Phase 2
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S4: Audric Passport ── */}
      <section id="passport" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
            Audric Passport
          </p>
          <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-10">
            Your passport to a new kind of finance.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
            {PASSPORT_PILLARS.map((p) => (
              <div key={p.title} className="bg-background p-6">
                <div className="text-[20px] mb-2.5">{p.icon}</div>
                <div className="text-[13px] font-semibold text-foreground mb-2">{p.title}</div>
                <p className="text-[12px] text-muted leading-[1.7]">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <button
              onClick={login}
              className="bg-foreground text-background px-7 py-3.5 font-mono text-[11px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
            >
              Sign in with Google — get your Passport
            </button>
          </div>
        </div>
      </section>

      {/* ── S5: Copilot ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
            Audric Copilot
          </p>
          <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-2 max-w-[600px]">
            Audric doesn&apos;t wait<br />to be asked.
          </h2>
          <p className="text-[13px] text-muted leading-[1.7] max-w-[540px] mb-10">
            Your financial copilot. Watches your money 24/7 and tells you what matters.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
            {COPILOT_FEATURES.map((f) => (
              <div key={f.title} className="bg-background p-5 sm:p-6">
                <div className="text-[18px] mb-2">{f.icon}</div>
                <div className="text-[13px] font-semibold text-foreground mb-2">{f.title}</div>
                <p className="text-[12px] text-muted leading-[1.7]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S6: Audric Store ── */}
      <section id="store" className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
              Audric Store
            </p>
            <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
              The new app store.
            </h2>
            <p className="text-[13px] text-muted leading-[1.7] mb-5">
              Create and sell any digital content. Get paid in USDC. No middleman.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-6">
              {STORE_CHIPS.map((chip) => (
                <span key={chip} className="font-mono text-[10px] px-2.5 py-1 border border-border rounded-full text-muted">
                  {chip}
                </span>
              ))}
            </div>
            <button className="bg-foreground text-background px-5 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer">
              Join the waitlist →
            </button>
          </div>

          <div>
            <div className="border border-border overflow-hidden">
              {STORE_STEPS.map((step, i) => (
                <div
                  key={step.num}
                  className={`bg-background px-5 py-4 ${i < STORE_STEPS.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div className="font-mono text-[11px] text-muted mb-1.5">
                    {step.num} {step.label}
                  </div>
                  <div className="text-[14px] font-semibold text-foreground mb-1">{step.title}</div>
                  <p className="text-[12px] text-muted leading-[1.6]">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-px bg-border border border-border border-t-0">
              {STORE_TRUST.map((t) => (
                <div key={t.title} className="bg-background px-3 py-3">
                  <div className="text-[10px] font-semibold text-foreground mb-1">{t.title}</div>
                  <p className="font-mono text-[9px] text-muted leading-[1.5]">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── S7: Audric Pay ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div className="max-w-[480px]">
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted mb-3">
              Audric Pay
            </p>
            <h2 className="text-[28px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-3">
              Your agent pays so you don&apos;t have to.
            </h2>
            <p className="text-[13px] text-muted leading-[1.7]">
              Give Audric a budget. It accesses 40+ AI services on your behalf — music, images, research, data — paying only what you approve, only for what you&apos;ve enabled. No subscriptions. No API keys. Just results.
            </p>
          </div>

          <div>
            <div className="grid grid-cols-3 gap-px bg-border border border-border">
              {[
                { value: '41', label: 'Services' },
                { value: '90+', label: 'Tasks' },
                { value: '$0.001', label: 'From' },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface px-5 py-4 text-center min-w-[90px]">
                  <div className="text-[20px] font-semibold text-foreground leading-none mb-1">{stat.value}</div>
                  <div className="font-mono text-[9px] text-muted">{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="text-right mt-2">
              <span className="font-mono text-[9px] text-dim">Powered by suimpp · On Sui</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── S8: Stats ── */}
      <section className="px-5 sm:px-10 lg:px-16 py-14 sm:py-20 bg-surface border-t border-border">
        <div className="max-w-[700px] mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
            {[
              { value: '—', label: 'Users' },
              { value: '—', label: 'Yield earned' },
              { value: '—', label: 'Transactions' },
              { value: '99.9%', label: 'Uptime' },
            ].map((stat) => (
              <div key={stat.label} className="bg-background px-4 py-5 text-center">
                <div className="text-[28px] font-semibold text-foreground leading-none mb-1 tracking-[-1px]">{stat.value}</div>
                <div className="font-mono text-[9px] text-muted">{stat.label}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2 mt-5 flex-wrap">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase px-2.5 py-1 border border-border text-muted">
              Built on Sui
            </span>
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase px-2.5 py-1 border border-border text-muted">
              Powered by NAVI Protocol
            </span>
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase px-2.5 py-1 border border-success text-success bg-success/5">
              MIT Open Source
            </span>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-5 sm:px-10 lg:px-16 py-8 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
          <div className="text-center sm:text-left">
            <div className="font-mono text-sm font-bold tracking-wide text-foreground uppercase mb-1">Audric</div>
            <div className="font-mono text-[10px] text-muted">Start managing your money.</div>
          </div>

          <button
            onClick={login}
            className="bg-foreground text-background px-5 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
          >
            Sign in with Google →
          </button>

          <div className="flex gap-4 flex-wrap justify-center">
            <a href="https://t2000.ai" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">t2000.ai</a>
            <a href="https://suimpp.dev" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">suimpp.dev</a>
            <a href="https://github.com/mission69b/t2000" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">GitHub</a>
            <a href="https://x.com/AudricAI" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">X</a>
            <a href="https://discord.gg/qE95FPt6Z5" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-dim hover:text-muted transition">Discord</a>
            <Link href="/terms" className="font-mono text-[10px] text-dim hover:text-muted transition">Terms</Link>
            <Link href="/privacy" className="font-mono text-[10px] text-dim hover:text-muted transition">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
