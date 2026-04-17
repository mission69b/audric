"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCopilotEnabled } from "@/hooks/useFeatureFlags";

export interface CopilotOnboardingState {
  showOnboarding: boolean;
  showEmailNudge: boolean;
  hasMigratedActions: boolean;
  confirmedCount: number;
  threshold: number;
}

const DEFAULTS: CopilotOnboardingState = {
  showOnboarding: false,
  showEmailNudge: false,
  hasMigratedActions: false,
  confirmedCount: 0,
  threshold: 10,
};

type DismissTarget = "onboarding" | "email_nudge";

/**
 * Wave C.7 — drives the CopilotOnboardingModal + EmailAddNudge surfaces.
 *
 * Optimistic dismiss: flips the local flag immediately so the modal/banner
 * disappears without waiting for the round-trip; rolls back on error.
 */
export function useCopilotOnboarding(
  address: string | null,
  jwt: string | null,
) {
  const enabled = useCopilotEnabled();
  const queryClient = useQueryClient();
  const queryKey = ["copilot-onboarding", address];

  const query = useQuery<CopilotOnboardingState>({
    queryKey,
    enabled: enabled && Boolean(address && jwt),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: DEFAULTS,
    queryFn: async () => {
      if (!address || !jwt) return DEFAULTS;
      const res = await fetch(
        `/api/user/copilot-onboarding?address=${address}`,
        { headers: { "x-zklogin-jwt": jwt } },
      );
      if (!res.ok) return DEFAULTS;
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (dismissed: DismissTarget) => {
      if (!address || !jwt) throw new Error("Not authenticated");
      const res = await fetch("/api/user/copilot-onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-zklogin-jwt": jwt,
        },
        body: JSON.stringify({ address, dismissed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to dismiss");
      }
      return (await res.json()) as { ok: true };
    },
    onMutate: async (dismissed) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CopilotOnboardingState>(queryKey);
      if (previous) {
        const patch =
          dismissed === "onboarding"
            ? { showOnboarding: false }
            : { showEmailNudge: false };
        queryClient.setQueryData<CopilotOnboardingState>(queryKey, {
          ...previous,
          ...patch,
        });
      }
      return { previous };
    },
    onError: (_err, _target, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    state: query.data ?? DEFAULTS,
    loading: query.isLoading,
    dismiss: mutation.mutate,
    dismissing: mutation.isPending,
  };
}
