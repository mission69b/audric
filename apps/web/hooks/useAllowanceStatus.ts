'use client';

import { useState, useEffect, useCallback } from 'react';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { SUI_NETWORK } from '@/lib/constants';

const LS_KEY_PREFIX = 'audric:allowanceId:';
const LS_SKIPPED_PREFIX = 'audric:setup-skipped:';

function lsKey(address: string) { return `${LS_KEY_PREFIX}${address}`; }
function skippedKey(address: string) { return `${LS_SKIPPED_PREFIX}${address}`; }

let _client: SuiJsonRpcClient | null = null;
function getClient() {
  if (!_client) {
    _client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });
  }
  return _client;
}

interface AllowanceFields {
  balance: unknown;
}

function parseU64(raw: unknown): bigint {
  if (typeof raw === 'string' || typeof raw === 'number') return BigInt(raw);
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    return BigInt((raw as { value: string }).value);
  }
  return BigInt(0);
}

async function fetchAllowanceBalance(client: SuiJsonRpcClient, id: string): Promise<bigint> {
  const obj = await client.getObject({ id, options: { showContent: true } });
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new Error(`Allowance ${id} not found`);
  }
  const fields = obj.data.content.fields as unknown as AllowanceFields;
  return parseU64(fields.balance);
}

export interface AllowanceStatus {
  allowanceId: string | null;
  balance: number | null;
  loading: boolean;
  skipped: boolean;
  refetch: () => void;
  setAllowanceId: (id: string) => void;
  markSkipped: () => void;
  /** Trigger on-chain discovery. Only call from setup/settings, not on every page load. */
  discover: () => Promise<string | null>;
}

export function useAllowanceStatus(address: string | null): AllowanceStatus {
  const [allowanceId, setAllowanceIdState] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipped, setSkipped] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!address) return;

    setLoading(true);

    try {
      if (typeof window !== 'undefined' && localStorage.getItem(skippedKey(address))) {
        setSkipped(true);
      }

      let id: string | null = null;

      if (typeof window !== 'undefined') {
        id = localStorage.getItem(lsKey(address));
      }

      // Step 1: check DB (allowanceId is a dedicated column, returned top-level)
      if (!id) {
        try {
          const res = await fetch(`/api/user/preferences?address=${address}`);
          const data = await res.json();
          id = data.allowanceId ?? null;
          if (id && typeof window !== 'undefined') {
            localStorage.setItem(lsKey(address), id);
          }
        } catch {}
      }

      if (id) {
        setAllowanceIdState(id);
        try {
          const raw = await fetchAllowanceBalance(getClient(), id);
          const USDC_DECIMALS = 6;
          setBalance(Number(raw) / 10 ** USDC_DECIMALS);
        } catch {
          setBalance(null);
        }
      } else {
        setAllowanceIdState(null);
        setBalance(null);
      }
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const setAllowanceId = useCallback((id: string) => {
    setAllowanceIdState(id);
    if (typeof window !== 'undefined' && address) {
      localStorage.setItem(lsKey(address), id);
      localStorage.removeItem(skippedKey(address));
    }
    setSkipped(false);
  }, [address]);

  const markSkipped = useCallback(() => {
    if (typeof window !== 'undefined' && address) {
      localStorage.setItem(skippedKey(address), '1');
    }
    setSkipped(true);
  }, [address]);

  const discover = useCallback(async (): Promise<string | null> => {
    if (!address) return null;
    try {
      const res = await fetch(`/api/user/allowance-discovery?address=${address}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.allowanceId) return null;

      const discovered = data.allowanceId as string;
      setAllowanceIdState(discovered);
      if (typeof window !== 'undefined') {
        localStorage.setItem(lsKey(address), discovered);
        localStorage.removeItem(skippedKey(address));
      }
      // Persist to dedicated column
      await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, allowanceId: discovered }),
      }).catch(() => {});

      // Fetch balance for the discovered allowance
      try {
        const raw = await fetchAllowanceBalance(getClient(), discovered);
        setBalance(Number(raw) / 10 ** 6);
      } catch {
        setBalance(data.balance ?? null);
      }

      setSkipped(false);
      return discovered;
    } catch {
      return null;
    }
  }, [address]);

  return {
    allowanceId,
    balance,
    loading,
    skipped,
    refetch: fetchStatus,
    setAllowanceId,
    markSkipped,
    discover,
  };
}
