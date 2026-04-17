"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCopilotEnabled } from "@/hooks/useFeatureFlags";

export type CopilotSuggestionAction =
  | "snooze"
  | "skip"
  | "pause_pattern"
  | "never_again";

export interface ScheduledActionSuggestion {
  kind: "scheduled_action";
  id: string;
  patternType: string | null;
  actionType: string;
  amount: string;
  asset: string;
  targetAsset: string | null;
  cronExpr: string;
  confidence: number | null;
  surfacedAt: string | null;
  expiresAt: string | null;
  failedAttempts: number;
}

export interface CopilotOneShotSuggestion {
  kind: "copilot_suggestion";
  id: string;
  type: "compound" | "idle_action" | "income_action" | "hf_topup";
  payload: Record<string, unknown> | null;
  surfacedAt: string;
  expiresAt: string;
  failedAttempts: number;
  snoozedCount: number;
}

export type CopilotSuggestion = ScheduledActionSuggestion | CopilotOneShotSuggestion;

interface SuggestionsResponse {
  suggestions: CopilotSuggestion[];
}

export function useCopilotSuggestions(address: string | null, jwt: string | null) {
  const enabled = useCopilotEnabled();

  return useQuery<SuggestionsResponse>({
    queryKey: ["copilot-suggestions", address],
    enabled: enabled && Boolean(address && jwt),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!address || !jwt) return { suggestions: [] };
      const res = await fetch(`/api/copilot/suggestions?address=${address}`, {
        headers: { "x-zklogin-jwt": jwt },
      });
      if (!res.ok) return { suggestions: [] };
      return res.json();
    },
  });
}

interface MutateArgs {
  id: string;
  kind: CopilotSuggestion["kind"];
  action: CopilotSuggestionAction;
}

export function useCopilotSuggestionAction(
  address: string | null,
  jwt: string | null
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, kind, action }: MutateArgs) => {
      if (!address || !jwt) throw new Error("Not authenticated");
      const res = await fetch(`/api/copilot/suggestions/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-zklogin-jwt": jwt,
        },
        body: JSON.stringify({ address, kind, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Action failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copilot-suggestions", address] });
    },
  });
}
