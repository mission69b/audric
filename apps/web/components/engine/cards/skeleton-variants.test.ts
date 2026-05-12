// SPEC 23C C2 — variant mapper tests
//
// Asserts (a) every tool with a registered renderer in
// ToolResultCard.CARD_RENDERERS gets a non-null variant, (b) tools known
// to render no card return null, (c) pay_api branches correctly by URL,
// (d) unknown tool names return null (default-skip).

import { describe, expect, test } from 'vitest';
import { getSkeletonVariant } from './skeleton-variants';

describe('getSkeletonVariant', () => {
  test('maps single-row reads to compact', () => {
    expect(getSkeletonVariant('rates_info')).toBe('compact');
    expect(getSkeletonVariant('swap_quote')).toBe('compact');
    expect(getSkeletonVariant('health_check')).toBe('compact');
    expect(getSkeletonVariant('token_prices')).toBe('compact');
    expect(getSkeletonVariant('volo_stats')).toBe('compact');
    expect(getSkeletonVariant('pending_rewards')).toBe('compact');
  });

  test('maps multi-row analytics + write receipts to wide', () => {
    expect(getSkeletonVariant('balance_check')).toBe('wide');
    expect(getSkeletonVariant('portfolio_analysis')).toBe('wide');
    expect(getSkeletonVariant('savings_info')).toBe('wide');
    expect(getSkeletonVariant('activity_summary')).toBe('wide');
    expect(getSkeletonVariant('yield_summary')).toBe('wide');
    expect(getSkeletonVariant('explain_tx')).toBe('wide');
    expect(getSkeletonVariant('protocol_deep_dive')).toBe('wide');
    expect(getSkeletonVariant('save_deposit')).toBe('wide');
    expect(getSkeletonVariant('swap_execute')).toBe('wide');
    expect(getSkeletonVariant('borrow')).toBe('wide');
    expect(getSkeletonVariant('repay_debt')).toBe('wide');
    expect(getSkeletonVariant('harvest_rewards')).toBe('wide');
  });

  test('maps multi-item lists to list', () => {
    expect(getSkeletonVariant('transaction_history')).toBe('list');
    expect(getSkeletonVariant('mpp_services')).toBe('list');
    expect(getSkeletonVariant('web_search')).toBe('list');
    expect(getSkeletonVariant('list_payment_links')).toBe('list');
    expect(getSkeletonVariant('list_invoices')).toBe('list');
  });

  test('maps single-line confirmations to chip', () => {
    expect(getSkeletonVariant('cancel_payment_link')).toBe('chip');
    expect(getSkeletonVariant('cancel_invoice')).toBe('chip');
    expect(getSkeletonVariant('save_contact')).toBe('chip');
    expect(getSkeletonVariant('resolve_suins')).toBe('chip');
  });

  test('returns null for tools with no card', () => {
    expect(getSkeletonVariant('spending_analytics')).toBeNull();
    expect(getSkeletonVariant('render_canvas')).toBeNull();
  });

  test('returns null for unknown tool names (default skip)', () => {
    expect(getSkeletonVariant('unknown_future_tool')).toBeNull();
    expect(getSkeletonVariant('')).toBeNull();
  });

  describe('pay_api URL-based dispatch', () => {
    test('image generation URLs → media-image', () => {
      expect(
        getSkeletonVariant('pay_api', {
          url: 'https://mpp.t2000.ai/openai/v1/images/generations',
        }),
      ).toBe('media-image');
    });

    test('audio TTS URLs → media-audio', () => {
      expect(
        getSkeletonVariant('pay_api', {
          url: 'https://mpp.t2000.ai/openai/v1/audio/speech',
        }),
      ).toBe('media-audio');
      expect(
        getSkeletonVariant('pay_api', {
          url: 'https://mpp.t2000.ai/elevenlabs/v1/text-to-speech/voice123',
        }),
      ).toBe('media-audio');
    });

    test('audio transcription URLs → media-audio', () => {
      expect(
        getSkeletonVariant('pay_api', {
          url: 'https://mpp.t2000.ai/openai/v1/audio/transcriptions',
        }),
      ).toBe('media-audio');
    });

    test('terminal vendor URLs (Lob, Resend, etc.) → receipt', () => {
      expect(
        getSkeletonVariant('pay_api', {
          url: 'https://mpp.t2000.ai/lob/v1/postcards',
        }),
      ).toBe('receipt');
      expect(
        getSkeletonVariant('pay_api', {
          url: 'https://mpp.t2000.ai/resend/v1/emails',
        }),
      ).toBe('receipt');
    });

    test('missing or malformed input → receipt fallback', () => {
      expect(getSkeletonVariant('pay_api')).toBe('receipt');
      expect(getSkeletonVariant('pay_api', null)).toBe('receipt');
      expect(getSkeletonVariant('pay_api', {})).toBe('receipt');
      expect(getSkeletonVariant('pay_api', { url: 123 })).toBe('receipt');
    });
  });
});
