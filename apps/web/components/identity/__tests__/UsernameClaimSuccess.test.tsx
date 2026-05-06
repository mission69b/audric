/**
 * SPEC 10 Phase B.3 — `<UsernameClaimSuccess>` component.
 *
 * Coverage:
 *   1. Renders headline + full handle + tagline.
 *   2. Copy button writes the FULL handle (`alice.audric.sui`) to clipboard.
 *   3. Copy button shows "Copied" feedback for ~1.5s then reverts.
 *   4. Show QR toggle is hidden entirely when walletAddress is missing.
 *   5. Show QR toggle expands → renders QR + handle + truncated address.
 *   6. Show QR toggle collapses on second click.
 *   7. Share to X button has correct href with templated tweet text.
 *   8. Continue button only renders when `onContinue` is provided.
 *   9. Continue button calls handler.
 *  10. Renders without props beyond `label` (degraded but functional).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UsernameClaimSuccess } from '../UsernameClaimSuccess';

// Mock the SuiPayQr wrapper — UsernameClaimSuccess consumes it directly
// (since the v0.6 QR-consistency fix that brought the success state in
// line with the rest of audric's receive flow). The mock surfaces the
// recipient + amount via data-* attrs so we can assert open-receive
// semantics (amount=null → bare sui:pay?recipient=… deep-link, no
// invoice nonce). The underlying QrCode + AudricMark + buildSuiPayUri
// stack is tested separately in their own test files.
vi.mock('@/components/pay/SuiPayQr', () => ({
  SuiPayQr: ({ recipientAddress, amount, size }: { recipientAddress: string; amount: number | null; size?: number }) => (
    <div
      data-testid="mock-sui-pay-qr"
      data-recipient={recipientAddress}
      data-amount={amount === null ? 'null' : String(amount)}
      data-size={size}
    >
      SuiPayQr({recipientAddress})
    </div>
  ),
}));

// jsdom doesn't ship navigator.clipboard. Stub it to capture writes
// without polluting the real implementation in other test files.
const clipboardWrites: string[] = [];

beforeEach(() => {
  clipboardWrites.length = 0;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (s: string) => {
        clipboardWrites.push(s);
      }),
    },
  });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UsernameClaimSuccess', () => {
  describe('rendering', () => {
    it('renders the full handle (label + .audric.sui)', () => {
      render(<UsernameClaimSuccess label="alice" walletAddress="0xabc" />);
      const handle = screen.getByTestId('username-claim-success-handle');
      expect(handle.textContent).toBe('alice.audric.sui');
    });

    it('renders the tagline ("yours on Sui — recognized everywhere")', () => {
      render(<UsernameClaimSuccess label="alice" />);
      expect(screen.getByText(/yours on Sui/)).toBeTruthy();
    });

    it('renders without walletAddress (degraded but functional)', () => {
      render(<UsernameClaimSuccess label="alice" />);
      // Handle still renders.
      expect(screen.getByTestId('username-claim-success-handle')).toBeTruthy();
      // Copy + Share buttons still render.
      expect(screen.getByTestId('username-claim-success-copy')).toBeTruthy();
      expect(screen.getByTestId('username-claim-success-share-x')).toBeTruthy();
      // QR toggle does NOT render — gated on walletAddress per the QR-needs-
      // an-address contract documented in the component header.
      expect(screen.queryByTestId('username-claim-success-qr-toggle')).toBeNull();
    });
  });

  describe('copy button', () => {
    it('writes the FULL handle to clipboard (not bare label, not 0x)', () => {
      render(<UsernameClaimSuccess label="alice" walletAddress="0xabc" />);
      fireEvent.click(screen.getByTestId('username-claim-success-copy'));
      expect(clipboardWrites).toEqual(['alice.audric.sui']);
    });

    it('shows "Copied" feedback then reverts after ~1.5s', () => {
      render(<UsernameClaimSuccess label="alice" />);
      const button = screen.getByTestId('username-claim-success-copy');
      // Pre-click: "Copy" label.
      expect(button.textContent).toContain('Copy');
      expect(button.textContent).not.toContain('Copied');
      // Click: feedback flips immediately.
      fireEvent.click(button);
      expect(button.textContent).toContain('Copied');
      // 1.5s later: feedback reverts.
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(button.textContent).toContain('Copy');
      expect(button.textContent).not.toContain('Copied');
    });

    it('updates aria-label between idle and copied state', () => {
      render(<UsernameClaimSuccess label="alice" />);
      const button = screen.getByTestId('username-claim-success-copy');
      expect(button.getAttribute('aria-label')).toBe('Copy alice.audric.sui');
      fireEvent.click(button);
      expect(button.getAttribute('aria-label')).toBe('Copied to clipboard');
    });
  });

  describe('show QR toggle', () => {
    it('expands to reveal SuiPayQr + handle + truncated address', () => {
      render(
        <UsernameClaimSuccess
          label="alice"
          walletAddress="0x40cd000000000000000000000000000000000000000000000000000000003e62"
        />,
      );
      // Pre-click: panel hidden.
      expect(screen.queryByTestId('username-claim-success-qr-panel')).toBeNull();
      // Click: panel visible with QR + truncated address.
      fireEvent.click(screen.getByTestId('username-claim-success-qr-toggle'));
      const panel = screen.getByTestId('username-claim-success-qr-panel');
      expect(panel).toBeTruthy();
      // SuiPayQr renders in open-receive mode (amount=null) with the
      // user's address as the recipient. The actual deep-link payload
      // (sui:pay?recipient=…) is built inside SuiPayQr — tested in
      // payment-kit.test.ts. Here we only assert the contract.
      const qr = screen.getByTestId('mock-sui-pay-qr');
      expect(qr.getAttribute('data-recipient')).toBe(
        '0x40cd000000000000000000000000000000000000000000000000000000003e62',
      );
      expect(qr.getAttribute('data-amount')).toBe('null');
      // Handle rendered above truncated address inside the panel.
      expect(panel.textContent).toContain('alice.audric.sui');
      expect(panel.textContent).toContain('0x40cd…3e62');
    });

    it('collapses on second click', () => {
      render(<UsernameClaimSuccess label="alice" walletAddress="0xabc" />);
      const toggle = screen.getByTestId('username-claim-success-qr-toggle');
      fireEvent.click(toggle);
      expect(screen.getByTestId('username-claim-success-qr-panel')).toBeTruthy();
      fireEvent.click(toggle);
      expect(screen.queryByTestId('username-claim-success-qr-panel')).toBeNull();
    });

    it('updates aria-expanded between collapsed and expanded states', () => {
      render(<UsernameClaimSuccess label="alice" walletAddress="0xabc" />);
      const toggle = screen.getByTestId('username-claim-success-qr-toggle');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('toggle button label flips between "Show QR" and "Hide QR"', () => {
      render(<UsernameClaimSuccess label="alice" walletAddress="0xabc" />);
      const toggle = screen.getByTestId('username-claim-success-qr-toggle');
      expect(toggle.textContent).toContain('Show QR');
      expect(toggle.textContent).not.toContain('Hide QR');
      fireEvent.click(toggle);
      expect(toggle.textContent).toContain('Hide QR');
      expect(toggle.textContent).not.toContain('Show QR');
    });
  });

  describe('share to X', () => {
    it('href has spec-locked tweet template (handle + audric.ai/label + 🪪)', () => {
      render(<UsernameClaimSuccess label="alice" />);
      const link = screen.getByTestId('username-claim-success-share-x');
      const href = link.getAttribute('href') ?? '';
      // Decode and assert the inner text — easier to read than checking
      // the encoded URL byte-for-byte.
      expect(href.startsWith('https://x.com/intent/tweet?text=')).toBe(true);
      const decoded = decodeURIComponent(href.replace('https://x.com/intent/tweet?text=', ''));
      // [S.89] Tweet copy was tightened — leads with "Audric Passport"
      // for narrative clarity and trails the URL on a separate line so
      // X renders the per-username OG hero card cleanly underneath.
      expect(decoded).toBe(
        'I just claimed my Audric Passport — alice.audric.sui 🪪\n\nPay me on Sui: https://audric.ai/alice',
      );
    });

    it('opens in new tab with rel="noreferrer noopener"', () => {
      render(<UsernameClaimSuccess label="alice" />);
      const link = screen.getByTestId('username-claim-success-share-x');
      expect(link.getAttribute('target')).toBe('_blank');
      const rel = link.getAttribute('rel') ?? '';
      expect(rel).toContain('noreferrer');
      expect(rel).toContain('noopener');
    });

    it('encodes special characters in the label safely', () => {
      // Hyphens are valid in handles (per validateLabel), and the encoder
      // should preserve them verbatim — they're URL-safe characters.
      render(<UsernameClaimSuccess label="alice-smith" />);
      const link = screen.getByTestId('username-claim-success-share-x');
      const href = link.getAttribute('href') ?? '';
      const decoded = decodeURIComponent(href.replace('https://x.com/intent/tweet?text=', ''));
      expect(decoded).toContain('alice-smith.audric.sui');
      expect(decoded).toContain('https://audric.ai/alice-smith');
    });
  });

  describe('continue CTA', () => {
    it('does NOT render when onContinue is omitted', () => {
      render(<UsernameClaimSuccess label="alice" />);
      expect(screen.queryByTestId('username-claim-success-continue')).toBeNull();
    });

    it('renders + fires handler when onContinue is provided', () => {
      const onContinue = vi.fn();
      render(<UsernameClaimSuccess label="alice" onContinue={onContinue} />);
      const button = screen.getByTestId('username-claim-success-continue');
      expect(button).toBeTruthy();
      fireEvent.click(button);
      expect(onContinue).toHaveBeenCalledTimes(1);
    });
  });
});
