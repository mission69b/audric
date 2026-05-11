'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface AgentStepProps {
  icon?: string;
  label: string;
  status: StepStatus;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
  /**
   * [SPEC 8 v0.5.1 B3.2] Optional dimmed metadata that renders to the
   * right of the label as `LABEL · meta`. Used by `ToolBlockView` to
   * surface "attempt N · 1.4s" when a tool went through HTTP retries.
   * Undefined (the common case) renders no extra text.
   */
  meta?: string;
}

// SPEC 23A-A3 — glyph audit against `audric_demos_v2/demos/*.html` (2026-05-11).
//
// Demo equivalents discovered + applied:
//   swap (Cetus row)           → '⇆' (demo 01)
//   mpp_services (DISCOVER)    → '⊞' (demo 05)
//   save_contact (CONTACT row) → '👤' (demo 01)
//
// SPEC 24 F4 (2026-05-11) — per-vendor `pay_api` glyphs ship NOW via the
// `getPayApiGlyph(input)` helper below. The 8 vendor-specific glyphs
// (✦ DALL-E, 🎙️ Whisper, 💬 GPT-4o, 🎤 ElevenLabs TTS, 🎶 ElevenLabs SFX,
// 📄 PDFShift, ✉ Lob, 📧 Resend) are dispatched by inspecting the call's
// URL — covers the locked 5-service supported set per SPEC_24_GATEWAY_INVENTORY.md
// §8. The base STEP_ICONS map keeps `pay_api: '⚡'` as the fallback for
// anything else (unsupported vendors, unknown URLs, no input — all rare
// given the system prompt teaches the LLM to stick to the supported set).
const STEP_ICONS: Record<string, string> = {
  balance_check: '💰',
  savings_info: '📊',
  health_check: '🛡️',
  rates_info: '📈',
  transaction_history: '📋',
  save_deposit: '🏦',
  withdraw: '📤',
  send_transfer: '🔄',
  borrow: '💳',
  repay_debt: '✅',
  claim_rewards: '🎁',
  harvest_rewards: '🌾',
  pending_rewards: '🎁',
  pay_api: '⚡',
  swap_execute: '⇆',
  volo_stake: '🥩',
  volo_unstake: '🥩',
  volo_stats: '📊',
  mpp_services: '⊞',
  token_prices: '💲',
  web_search: '🔍',
  explain_tx: '🔎',
  portfolio_analysis: '📊',
  protocol_deep_dive: '🛡️',
  save_contact: '👤',
  render_canvas: '🖼️',
  create_payment_link: '🔗',
  list_payment_links: '🔗',
  cancel_payment_link: '🔗',
  create_invoice: '📄',
  list_invoices: '📄',
  cancel_invoice: '📄',
  spending_analytics: '💸',
  swap_quote: '⇆',
  yield_summary: '📈',
  activity_summary: '📋',
  record_advice: '📝',
  resolve_suins: '🪪',
  update_todo: '🗒️',
};

const STEP_LABELS: Record<string, string> = {
  balance_check: 'BALANCE CHECK',
  savings_info: 'SAVINGS INFO',
  health_check: 'HEALTH CHECK',
  rates_info: 'RATES INFO',
  transaction_history: 'TRANSACTION HISTORY',
  save_deposit: 'DEPOSIT',
  withdraw: 'WITHDRAW',
  send_transfer: 'SEND TRANSFER',
  borrow: 'BORROW',
  repay_debt: 'REPAY',
  claim_rewards: 'CLAIM REWARDS',
  harvest_rewards: 'HARVEST REWARDS',
  pending_rewards: 'PENDING REWARDS',
  pay_api: 'API CALL',
  swap_execute: 'SWAP',
  volo_stake: 'STAKE SUI',
  volo_unstake: 'UNSTAKE VSUI',
  volo_stats: 'VOLO STATS',
  mpp_services: 'DISCOVER SERVICES',
  token_prices: 'TOKEN PRICES',
  web_search: 'WEB SEARCH',
  explain_tx: 'EXPLAIN TRANSACTION',
  portfolio_analysis: 'PORTFOLIO ANALYSIS',
  protocol_deep_dive: 'PROTOCOL DEEP DIVE',
  save_contact: 'SAVE CONTACT',
  render_canvas: 'DRAW CANVAS',
  create_payment_link: 'CREATE PAYMENT LINK',
  list_payment_links: 'LIST PAYMENT LINKS',
  cancel_payment_link: 'CANCEL PAYMENT LINK',
  create_invoice: 'CREATE INVOICE',
  list_invoices: 'LIST INVOICES',
  cancel_invoice: 'CANCEL INVOICE',
  spending_analytics: 'SPENDING ANALYTICS',
  swap_quote: 'SWAP QUOTE',
  yield_summary: 'YIELD SUMMARY',
  activity_summary: 'ACTIVITY SUMMARY',
  record_advice: 'RECORD ADVICE',
  resolve_suins: 'RESOLVE SUINS',
  update_todo: 'UPDATING PLAN',
};

/**
 * SPEC 24 F4 (locked 2026-05-11) — per-vendor `pay_api` glyph dispatch.
 *
 * The base `STEP_ICONS['pay_api']` is `'⚡'` — a generic API-call glyph that
 * fires for any pay_api tool call regardless of vendor. F4 introduces vendor-
 * specific glyphs (✦ DALL-E, 🎙️ Whisper, etc.) by inspecting the call's URL,
 * which is the only field on `pay_api` input that distinguishes one MPP
 * service from another (the engine tool itself is generic).
 *
 * Covers the locked 5-service supported set (11 endpoints) per
 * SPEC_24_GATEWAY_INVENTORY.md §8:
 *
 *   openai      ✦ images / 🎙️ transcription / 💬 chat
 *   elevenlabs  🎤 TTS / 🎶 sound-generation
 *   pdfshift    📄
 *   lob         ✉ (postcards / letters / address-verify all share the icon)
 *   resend      📧 (transactional + batch email share the icon)
 *
 * Falls back to `'⚡'` (the generic pay_api glyph) for:
 *   - undefined / non-object input (engine state where input hasn't streamed yet)
 *   - input.url present but no vendor pattern matches (dropped service the
 *     prompt should have prevented — telemetry surfaces these as a signal)
 *
 * To add a vendor (after re-enabling via the SPEC_24_GATEWAY_INVENTORY.md §8
 * add-back recipe), add ONE `if (url.includes('/<vendor>')) return '<glyph>';`
 * line below. No type changes, no test rewrites — pin the new glyph with a
 * single test asserting the case.
 */
export function getPayApiGlyph(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '⚡';
  const url = (input as { url?: unknown }).url;
  if (typeof url !== 'string') return '⚡';

  // OpenAI — endpoint-aware (3 supported endpoints)
  if (url.includes('/openai/v1/images')) return '✦';                  // DALL-E
  if (url.includes('/openai/v1/audio/transcriptions')) return '🎙️';  // Whisper
  if (url.includes('/openai/v1/chat')) return '💬';                   // GPT-4o
  // ElevenLabs — endpoint-aware (2 supported endpoints)
  if (url.includes('/elevenlabs/v1/text-to-speech')) return '🎤';     // premium TTS
  if (url.includes('/elevenlabs/v1/sound-generation')) return '🎶';   // sound effects
  // Single-icon services (multiple endpoints, but glyph doesn't differentiate)
  if (url.includes('/pdfshift')) return '📄';
  if (url.includes('/lob')) return '✉';
  if (url.includes('/resend')) return '📧';
  // Unsupported vendor (post-SPEC-24 the system prompt should keep the LLM
  // from getting here — telemetry surfaces fall-throughs as a signal that
  // the prompt isn't doing its job).
  return '⚡';
}

/**
 * SPEC 24 F4 — `getStepIcon` extended to accept optional `input` so callers
 * with access to a tool's input (every callsite today: ToolBlockView /
 * ParallelToolsGroup / PostWriteRefreshSurface) can opt into vendor-aware
 * `pay_api` glyphs without a call-site if/else. Other tools ignore `input`.
 *
 * Backward compatible: callers that don't pass `input` get the same glyph
 * map lookup they got pre-F4 (pay_api → '⚡').
 */
export function getStepIcon(toolName: string, input?: unknown): string {
  if (toolName === 'pay_api' && input !== undefined) {
    return getPayApiGlyph(input);
  }
  return STEP_ICONS[toolName] ?? '⚙️';
}

export function getStepLabel(toolName: string): string {
  return STEP_LABELS[toolName] ?? toolName.replace(/_/g, ' ').toUpperCase();
}

function StatusDot({ status }: { status: StepStatus }) {
  switch (status) {
    case 'pending':
      return <span className="w-4 h-4 rounded-full border border-border-strong shrink-0" aria-hidden="true" />;
    case 'running':
      return (
        <span className="w-4 h-4 rounded-full border-2 border-fg-primary border-t-transparent shrink-0 animate-spin" aria-hidden="true" />
      );
    case 'done':
      return (
        <span className="w-4 h-4 rounded-full bg-success-solid shrink-0 flex items-center justify-center" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case 'error':
      return <span className="w-4 h-4 rounded-full bg-error-solid shrink-0" aria-hidden="true" />;
  }
}

export function AgentStep({
  icon,
  label,
  status,
  collapsible = false,
  defaultExpanded = true,
  children,
  meta,
}: AgentStepProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const content = (
    <div className="flex items-center gap-2 py-1">
      <StatusDot status={status} />
      {icon && <span className="text-sm leading-none shrink-0">{icon}</span>}
      <span className={`font-mono text-[10px] tracking-[0.1em] uppercase ${status === 'done' || status === 'error' ? 'text-fg-secondary' : 'text-fg-primary'}`}>
        {label}
      </span>
      {meta && (
        <span className="font-mono text-[10px] tracking-[0.05em] uppercase text-fg-muted">
          · {meta}
        </span>
      )}
      {collapsible && (
        <span
          className={`inline-flex text-fg-muted transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <Icon name="chevron-down" size={10} />
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-0.5" role="status" aria-label={`${label}: ${status}`}>
      {collapsible ? (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center hover:opacity-70 transition-opacity"
          aria-expanded={expanded}
        >
          {content}
        </button>
      ) : (
        content
      )}
      {children && expanded && (
        <div className="ml-[5px] pl-4 border-l border-border-subtle">
          {children}
        </div>
      )}
    </div>
  );
}
