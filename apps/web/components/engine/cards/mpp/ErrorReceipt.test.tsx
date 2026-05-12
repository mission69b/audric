/**
 * SPEC 23B-MPP6 v1.1 — ErrorReceipt tests.
 *
 * Two variants tested:
 *   - PAID-BUT-FAILED: paymentConfirmed: true, paymentDigest set →
 *     shows price, "Payment charged · refund pending", Suiscan link
 *   - NOT-CHARGED: paymentConfirmed: false → shows em-dash price,
 *     "No charge · safe to retry", NO Suiscan link
 *
 * Plus vendor-name extraction (known vendors map to display labels;
 * unknown vendors capitalise the slug; missing serviceId falls back
 * to "MPP").
 *
 * Pinned regression: the 2026-05-12 ElevenLabs smoke that surfaced
 * `bug_audric_error_receipt_shape` (HANDOFF §8) — pre-fix the failed
 * call rendered as "MPP SERVICE · MPP" with `—` price and no error
 * messaging. These tests guarantee that path can never silently
 * regress.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ErrorReceipt } from './ErrorReceipt';

describe('ErrorReceipt — PAID-BUT-FAILED variant (ServiceDeliveryError)', () => {
  const paidErrorPayload = {
    success: false as const,
    error: 'ElevenLabs API returned 500: Internal Server Error',
    paymentConfirmed: true,
    paymentDigest: '2bfGJnSyAbCdEfGhJk1234567Mnopqr8jry81',
    serviceId: 'elevenlabs/v1/text-to-speech/eleven_monolingual_v1',
    price: '0.05',
    doNotRetry: true,
    warning: 'Payment was already charged on-chain. DO NOT call pay_api again.',
  };

  it('renders vendor-named header (ELEVENLABS · MPP · FAILED)', () => {
    const { container } = render(<ErrorReceipt data={paidErrorPayload} />);
    expect(container.textContent).toContain('ELEVENLABS · MPP · FAILED');
  });

  it('renders the price the user was charged', () => {
    const { container } = render(<ErrorReceipt data={paidErrorPayload} />);
    expect(container.textContent).toContain('$0.05');
  });

  it('renders the error message body', () => {
    const { container } = render(<ErrorReceipt data={paidErrorPayload} />);
    expect(container.textContent).toContain('ElevenLabs API returned 500');
  });

  it('renders the "Payment charged · refund pending" status line', () => {
    const { container } = render(<ErrorReceipt data={paidErrorPayload} />);
    expect(container.textContent).toContain('Payment charged');
    expect(container.textContent).toContain('refund pending');
  });

  it('renders the Suiscan link (paymentDigest is present)', () => {
    const { container } = render(<ErrorReceipt data={paidErrorPayload} />);
    // SuiscanLink renders an <a> with href containing the digest
    const links = container.querySelectorAll('a[href*="suiscan"]');
    expect(links.length).toBeGreaterThan(0);
  });

  it('renders the warning ⚠ glyph (NOT the success ✦ sparkle)', () => {
    const { container } = render(<ErrorReceipt data={paidErrorPayload} />);
    expect(container.textContent).toContain('⚠');
    expect(container.textContent).not.toContain('✦');
  });
});

describe('ErrorReceipt — NOT-CHARGED variant (pre-payment failure)', () => {
  const unpaidErrorPayload = {
    success: false as const,
    error: 'Network timeout connecting to gateway',
    paymentConfirmed: false,
    serviceId: 'openai/v1/images/generations',
  };

  it('renders vendor-named header (OPENAI · MPP · FAILED)', () => {
    const { container } = render(<ErrorReceipt data={unpaidErrorPayload} />);
    expect(container.textContent).toContain('OPENAI · MPP · FAILED');
  });

  it('renders em-dash for price (user was NOT charged)', () => {
    const { container } = render(<ErrorReceipt data={unpaidErrorPayload} />);
    expect(container.textContent).toContain('—');
  });

  it('renders "No charge · safe to retry" status line', () => {
    const { container } = render(<ErrorReceipt data={unpaidErrorPayload} />);
    expect(container.textContent).toContain('No charge');
    expect(container.textContent).toContain('safe to retry');
  });

  it('does NOT render a Suiscan link (no payment digest)', () => {
    const { container } = render(<ErrorReceipt data={unpaidErrorPayload} />);
    const links = container.querySelectorAll('a[href*="suiscan"]');
    expect(links.length).toBe(0);
  });

  it('renders the error message body', () => {
    const { container } = render(<ErrorReceipt data={unpaidErrorPayload} />);
    expect(container.textContent).toContain('Network timeout');
  });

  it('treats missing paymentConfirmed as not-charged (no Suiscan link)', () => {
    // Defensive: paymentConfirmed undefined should default to NOT-CHARGED
    // because we can't prove the payment went through without an explicit
    // flag — better to show "no charge" and have the user retry than to
    // imply they were charged when we don't know.
    const { container } = render(
      <ErrorReceipt
        data={{
          success: false,
          error: 'Unknown error',
          serviceId: 'lob/v1/postcards',
          paymentDigest: 'should-not-render-this',
        }}
      />,
    );
    const links = container.querySelectorAll('a[href*="suiscan"]');
    expect(links.length).toBe(0);
    expect(container.textContent).toContain('No charge');
  });
});

describe('ErrorReceipt — vendor name extraction', () => {
  it('maps known vendor slugs to display labels', () => {
    const vendors = [
      { serviceId: 'openai/v1/images/generations', label: 'OPENAI' },
      { serviceId: 'elevenlabs/v1/text-to-speech', label: 'ELEVENLABS' },
      { serviceId: 'pdfshift/v1/convert', label: 'PDFSHIFT' },
      { serviceId: 'lob/v1/postcards', label: 'LOB' },
      { serviceId: 'resend/v1/emails', label: 'RESEND' },
    ];
    for (const v of vendors) {
      const { container } = render(
        <ErrorReceipt
          data={{
            success: false,
            error: 'failed',
            serviceId: v.serviceId,
            paymentConfirmed: false,
          }}
        />,
      );
      expect(container.textContent).toContain(v.label);
    }
  });

  it('humanises unknown vendor slug (capitalised first segment)', () => {
    const { container } = render(
      <ErrorReceipt
        data={{
          success: false,
          error: 'failed',
          serviceId: 'somefutureservice/v1/foo',
          paymentConfirmed: false,
        }}
      />,
    );
    expect(container.textContent).toContain('SOMEFUTURESERVICE');
  });

  it('falls back to "MPP" when serviceId is missing entirely', () => {
    const { container } = render(
      <ErrorReceipt
        data={{
          success: false,
          error: 'failed',
          paymentConfirmed: false,
        }}
      />,
    );
    expect(container.textContent).toContain('MPP · MPP · FAILED');
  });

  it('handles gateway-prefixed serviceId (https://mpp.t2000.ai/...)', () => {
    const { container } = render(
      <ErrorReceipt
        data={{
          success: false,
          error: 'failed',
          serviceId: 'https://mpp.t2000.ai/elevenlabs/v1/text-to-speech',
          paymentConfirmed: false,
        }}
      />,
    );
    expect(container.textContent).toContain('ELEVENLABS');
  });
});
