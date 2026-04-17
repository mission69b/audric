"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCopilotEnabled } from "@/hooks/useFeatureFlags";

export interface CopilotPrefs {
  digestEnabled: boolean;
  digestSendHourLocal: number;
  hfWidgetEnabled: boolean;
}

const DEFAULTS: CopilotPrefs = {
  digestEnabled: true,
  digestSendHourLocal: 8,
  hfWidgetEnabled: true,
};

export function useCopilotPrefs(address: string | null, jwt: string | null) {
  const enabled = useCopilotEnabled();
  const queryClient = useQueryClient();

  const query = useQuery<CopilotPrefs>({
    queryKey: ["copilot-prefs", address],
    enabled: enabled && Boolean(address && jwt),
    staleTime: 60 * 1000,
    placeholderData: DEFAULTS,
    queryFn: async () => {
      if (!address || !jwt) return DEFAULTS;
      const res = await fetch(`/api/user/copilot-prefs?address=${address}`, {
        headers: { "x-zklogin-jwt": jwt },
      });
      if (!res.ok) return DEFAULTS;
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<CopilotPrefs>) => {
      if (!address || !jwt) throw new Error("Not authenticated");
      const res = await fetch("/api/user/copilot-prefs", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-zklogin-jwt": jwt,
        },
        body: JSON.stringify({ address, ...patch }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update preferences");
      }
      return (await res.json()) as CopilotPrefs;
    },
    // Optimistic so toggles feel snappy. Rollback on error.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["copilot-prefs", address] });
      const previous = queryClient.getQueryData<CopilotPrefs>([
        "copilot-prefs",
        address,
      ]);
      if (previous) {
        queryClient.setQueryData<CopilotPrefs>(
          ["copilot-prefs", address],
          { ...previous, ...patch },
        );
      }
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["copilot-prefs", address], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["copilot-prefs", address] });
    },
  });

  return {
    prefs: query.data ?? DEFAULTS,
    loading: query.isLoading,
    updating: mutation.isPending,
    error: mutation.error,
    update: mutation.mutate,
  };
}
