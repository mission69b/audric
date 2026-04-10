'use client';

import { useEffect, useRef, useState } from 'react';
import type { PendingAction } from '@/lib/engine-types';

const TOOL_LABELS: Record<string, string> = {
  save_deposit: 'Save deposit',
  withdraw: 'Withdraw',
  send_transfer: 'Send transfer',
  borrow: 'Borrow',
  repay_debt: 'Repay debt',
  claim_rewards: 'Claim rewards',
  pay_api: 'Pay for API',
  swap_execute: 'Swap',
  volo_stake: 'Stake',
  volo_unstake: 'Unstake',
};

const TIMEOUT_SEC = 60;

const COIN_TYPE_SYMBOLS: Record<string, string> = {
  '0x2::sui::SUI': 'SUI',
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': 'USDC',
  '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT': 'USDT',
  '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS': 'CETUS',
  '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP': 'DEEP',
  '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX': 'NAVX',
  '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT': 'vSUI',
  '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL': 'WAL',
  '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH': 'ETH',
};

function resolveSymbol(nameOrType: unknown): string {
  const s = String(nameOrType ?? '?');
  if (COIN_TYPE_SYMBOLS[s]) return COIN_TYPE_SYMBOLS[s];
  if (s.includes('::')) {
    const parts = s.split('::');
    return parts[parts.length - 1];
  }
  return s;
}

function formatInput(input: unknown, toolName?: string): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;

  if (toolName === 'swap_execute') {
    const from = resolveSymbol(obj.from);
    const to = resolveSymbol(obj.to);
    const amt = obj.amount ?? '?';
    return `${amt} ${from} → ${to}`;
  }
  if (toolName === 'volo_stake') {
    return `${obj.amount ?? '?'} SUI → vSUI`;
  }
  if (toolName === 'volo_unstake') {
    return obj.amount === 'all' ? 'All vSUI → SUI' : `${obj.amount ?? '?'} vSUI → SUI`;
  }

  const parts: string[] = [];
  if (obj.amount) parts.push(`$${obj.amount}`);
  if (obj.asset) parts.push(String(obj.asset));
  if (obj.to) parts.push(`To: ${String(obj.to).slice(0, 8)}...`);
  if (obj.recipient) parts.push(`To: ${String(obj.recipient).slice(0, 8)}...`);
  if (obj.url) parts.push(String(obj.url).replace('https://mpp.t2000.ai/', ''));
  if (obj.maxPrice) parts.push(`max $${obj.maxPrice}`);
  if (obj.memo) parts.push(`"${String(obj.memo)}"`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export type DenyReason = 'timeout' | 'denied';

interface PermissionCardProps {
  action: PendingAction;
  onResolve: (action: PendingAction, approved: boolean, reason?: DenyReason) => void;
}

export function PermissionCard({ action, onResolve }: PermissionCardProps) {
  const [resolved, setResolved] = useState(false);
  const resolvedRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SEC);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const label = TOOL_LABELS[action.toolName] ?? action.toolName.replace(/_/g, ' ');
  const inputSummary = formatInput(action.input, action.toolName);

  const handle = (approved: boolean, reason?: DenyReason) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setResolved(true);
    if (timerRef.current) clearInterval(timerRef.current);
    onResolve(action, approved, reason);
  };

  useEffect(() => {
    if (resolved) return;

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          handle(false, 'timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  const progress = secondsLeft / TIMEOUT_SEC;

  return (
    <div
      className="rounded-xl border border-border bg-surface p-3 space-y-2.5 shadow-[var(--shadow-card)]"
      role="alertdialog"
      aria-label={`Confirm ${label}`}
      aria-describedby={`perm-desc-${action.toolUseId}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {!resolved && (
          <span
            className={`text-[10px] font-mono tabular-nums ${secondsLeft <= 10 ? 'text-error' : 'text-muted'}`}
            aria-label={`${secondsLeft} seconds remaining`}
          >
            {secondsLeft}s
          </span>
        )}
      </div>

      {!resolved && (
        <div className="h-0.5 w-full bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground/30 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {action.description && (
        <p className="text-xs text-muted" id={`perm-desc-${action.toolUseId}`}>{action.description}</p>
      )}

      {inputSummary && (
        <p className="text-sm font-mono text-foreground">{inputSummary}</p>
      )}

      {!resolved ? (
        <div className="flex gap-2">
          <button
            onClick={() => handle(false, 'denied')}
            className="flex-1 rounded-lg border border-border bg-background py-2 text-xs font-medium text-muted hover:text-foreground hover:border-border-bright transition active:scale-[0.97]"
          >
            Deny
          </button>
          <button
            onClick={() => handle(true)}
            className="flex-1 rounded-lg bg-foreground py-2 text-xs font-semibold text-background transition hover:opacity-90 active:scale-[0.97]"
          >
            Approve
          </button>
        </div>
      ) : (
        <div className="text-xs text-muted text-center py-1">Processing...</div>
      )}
    </div>
  );
}
