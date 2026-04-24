import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSuiRpcUrl } from '../sui-rpc';

const KEYS = [
  'BLOCKVISION_API_KEY',
  'SUI_RPC_URL',
  'NEXT_PUBLIC_SUI_NETWORK',
] as const;

describe('getSuiRpcUrl', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it('falls back to the public mainnet fullnode when nothing is set', () => {
    expect(getSuiRpcUrl()).toBe('https://fullnode.mainnet.sui.io:443');
  });

  it('respects NEXT_PUBLIC_SUI_NETWORK=testnet for the public fallback', () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'testnet';
    expect(getSuiRpcUrl()).toBe('https://fullnode.testnet.sui.io:443');
  });

  it('uses BlockVision dashboard URL format when API key is set', () => {
    process.env.BLOCKVISION_API_KEY = 'test-key-123';
    // Format must match the BlockVision dashboard exactly:
    //   https://sui-mainnet.blockvision.org/v1/<KEY>
    expect(getSuiRpcUrl()).toBe(
      'https://sui-mainnet.blockvision.org/v1/test-key-123',
    );
  });

  it('uses the testnet BlockVision endpoint when network=testnet', () => {
    process.env.BLOCKVISION_API_KEY = 'test-key-123';
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'testnet';
    expect(getSuiRpcUrl()).toBe(
      'https://sui-testnet.blockvision.org/v1/test-key-123',
    );
  });

  it('SUI_RPC_URL override takes precedence over BlockVision', () => {
    process.env.SUI_RPC_URL = 'https://custom.example/rpc';
    process.env.BLOCKVISION_API_KEY = 'should-be-ignored';
    expect(getSuiRpcUrl()).toBe('https://custom.example/rpc');
  });
});
