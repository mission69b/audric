'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ScheduledAction {
  id: string;
  actionType: string;
  amount: number;
  asset: string;
  targetAsset: string | null;
  cronExpr: string;
  nextRunAt: string;
  enabled: boolean;
  confirmationsRequired: number;
  confirmationsCompleted: number;
  totalExecutions: number;
  totalAmountUsdc: number;
  lastExecutedAt: string | null;
  createdAt: string;
  source: string;
  patternType: string | null;
  stage: number;
  confidence: number | null;
  pausedAt: string | null;
  declinedAt: string | null;
}

export function useScheduledActions(address: string | null, jwt: string | null) {
  const [actions, setActions] = useState<ScheduledAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    if (!address || !jwt) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/scheduled-actions?address=${address}`, {
        headers: { 'x-zklogin-jwt': jwt },
      });
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [address, jwt]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const updateAction = useCallback(async (id: string, patch: Record<string, unknown>) => {
    if (!address || !jwt) return;
    setUpdating(id);
    try {
      const res = await fetch(`/api/scheduled-actions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-zklogin-jwt': jwt,
        },
        body: JSON.stringify({ address, ...patch }),
      });
      if (res.ok) {
        await fetchActions();
      }
    } catch { /* ignore */ }
    setUpdating(null);
  }, [address, jwt, fetchActions]);

  const pauseAction = useCallback((id: string) => updateAction(id, { enabled: false }), [updateAction]);
  const resumeAction = useCallback((id: string) => updateAction(id, { enabled: true }), [updateAction]);
  const deleteAction = useCallback((id: string) => updateAction(id, { action: 'delete' }), [updateAction]);
  const acceptProposal = useCallback((id: string) => updateAction(id, { action: 'accept_proposal' }), [updateAction]);
  const declineProposal = useCallback((id: string) => updateAction(id, { action: 'decline_proposal' }), [updateAction]);
  const pausePattern = useCallback((id: string) => updateAction(id, { action: 'pause_pattern' }), [updateAction]);
  const resumePattern = useCallback((id: string) => updateAction(id, { action: 'resume_pattern' }), [updateAction]);

  return {
    actions, loading, updating,
    pauseAction, resumeAction, deleteAction,
    acceptProposal, declineProposal, pausePattern, resumePattern,
    refresh: fetchActions,
  };
}
