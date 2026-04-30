import { describe, it, expect, vi } from 'vitest';

// Mock the env module before importing payment-kit. The real env module
// throws at import time when required vars are missing — fine for app
// boot, hostile to unit tests that don't care about the gRPC client.
vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_SUI_NETWORK: 'mainnet' },
}));

vi.mock('@/lib/sui-rpc', () => ({
  getSuiRpcUrl: () => 'https://fullnode.mainnet.sui.io:443',
}));

import { buildSuiPayUri, USDC_TYPE, USDC_DECIMALS } from '@/lib/payment-kit';

const ADDRESS =
  '0x7f2059fb1c395f4800809b4b97ed8e661535c8c55f89b1379b6b9d0208d2f6dc';

describe('buildSuiPayUri — amountless (open-receive) mode', () => {
  it('produces a sui:pay URI with recipient + USDC coinType by default', () => {
    const uri = buildSuiPayUri({ recipient: ADDRESS, amount: null });

    expect(uri.startsWith('sui:pay?')).toBe(true);

    const params = new URLSearchParams(uri.slice('sui:pay?'.length));
    expect(params.get('recipient')).toBe(ADDRESS);
    expect(params.get('coinType')).toBe(USDC_TYPE);
    expect(params.has('amount')).toBe(false);
    expect(params.has('nonce')).toBe(false);
  });

  it('treats amount: undefined the same as null', () => {
    const uri = buildSuiPayUri({ recipient: ADDRESS });
    expect(uri.startsWith('sui:pay?')).toBe(true);
  });

  it('treats amount: 0 as open-receive (no amount param)', () => {
    // Zero is not a meaningful payment amount — fall through to open-receive
    // rather than throwing or encoding a 0-amount invoice.
    const uri = buildSuiPayUri({ recipient: ADDRESS, amount: 0 });
    expect(uri.startsWith('sui:pay?')).toBe(true);
    expect(uri).not.toContain('amount=');
  });

  it('honours a custom coinType when provided', () => {
    const customType = '0xfeed::dog::PEPE';
    const uri = buildSuiPayUri({
      recipient: ADDRESS,
      amount: null,
      coinType: customType,
    });
    expect(new URLSearchParams(uri.slice('sui:pay?'.length)).get('coinType')).toBe(
      customType,
    );
  });
});

describe('buildSuiPayUri — invoice (amount-set) mode', () => {
  it('throws when amount > 0 but no nonce supplied', () => {
    // payment-kit's createPaymentTransactionUri requires a nonce for invoice
    // mode (uniqueness across payment links). Surface the constraint at
    // the helper boundary rather than letting the wrapped error leak out.
    expect(() => buildSuiPayUri({ recipient: ADDRESS, amount: 5.5 })).toThrow(
      /nonce required/,
    );
  });

  it('produces a payment-kit URI when amount + nonce are set', () => {
    const uri = buildSuiPayUri({
      recipient: ADDRESS,
      amount: 5.5,
      nonce: 'test-nonce-123',
    });

    // payment-kit's createPaymentTransactionUri builds a richer URI than the
    // bare amountless variant — it includes the recipient, raw amount in
    // base units (5.5 USDC = 5_500_000), and the nonce. We assert the
    // shape rather than the exact encoding so a future payment-kit version
    // bump (encoding tweaks, new params) doesn't break the test.
    expect(typeof uri).toBe('string');
    expect(uri.length).toBeGreaterThan(0);
    expect(uri).toContain(ADDRESS);
    expect(uri).toContain('test-nonce-123');
  });
});

describe('exports', () => {
  it('USDC_TYPE is the canonical mainnet USDC coin type', () => {
    expect(USDC_TYPE).toBe(
      '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    );
  });

  it('USDC_DECIMALS matches the on-chain decimal count', () => {
    expect(USDC_DECIMALS).toBe(6);
  });
});
