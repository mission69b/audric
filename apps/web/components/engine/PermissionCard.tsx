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
};

const TIMEOUT_SEC = 60;

function formatInput(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const parts: string[] = [];
  if (obj.amount) parts.push(`$${obj.amount}`);
  if (obj.asset) parts.push(String(obj.asset));
  if (obj.to) parts.push(`To: ${String(obj.to).slice(0, 8)}...`);
  if (obj.recipient) parts.push(`To: ${String(obj.recipient).slice(0, 8)}...`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface PermissionCardProps {
  action: PendingAction;
  onResolve: (action: PendingAction, approved: boolean) => void;
}

export function PermissionCard({ action, onResolve }: PermissionCardProps) {
  const [resolved, setResolved] = useState(false);
  const resolvedRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SEC);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const label = TOOL_LABELS[action.toolName] ?? action.toolName.replace(/_/g, ' ');
  const inputSummary = formatInput(action.input);

  const handle = (approved: boolean) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setResolved(true);
    if (timerRef.current) clearInterval(timerRef.current);
    onResolve(action, approved);
  };

  useEffect(() => {
    if (resolved) return;

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          handle(false);
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
            onClick={() => handle(false)}
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
