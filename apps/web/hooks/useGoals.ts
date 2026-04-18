import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export interface SavingsGoal {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number;
  deadline: string | null;
  status: string;
  createdAt: string;
}

interface GoalsResponse {
  goals: SavingsGoal[];
}

interface CreateGoalInput {
  name: string;
  emoji?: string;
  targetAmount: number;
  deadline?: string;
}

interface UpdateGoalInput {
  name?: string;
  emoji?: string;
  targetAmount?: number;
  deadline?: string | null;
}

export function useGoals(address: string | null, jwt: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['goals', address];

  const query = useQuery<GoalsResponse>({
    queryKey,
    enabled: !!address && !!jwt,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/user/goals?address=${address}`, {
        headers: { 'x-zklogin-jwt': jwt! },
      });
      if (!res.ok) throw new Error('Failed to fetch goals');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateGoalInput) => {
      const res = await fetch('/api/user/goals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zklogin-jwt': jwt!,
        },
        body: JSON.stringify({ address, ...input }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to create goal');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ goalId, ...input }: UpdateGoalInput & { goalId: string }) => {
      const res = await fetch(`/api/user/goals/${goalId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-zklogin-jwt': jwt!,
        },
        body: JSON.stringify({ address, ...input }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to update goal');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const res = await fetch(`/api/user/goals/${goalId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-zklogin-jwt': jwt!,
        },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error('Failed to delete goal');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const createGoal = useCallback(
    (input: CreateGoalInput) => createMutation.mutateAsync(input),
    [createMutation],
  );

  const updateGoal = useCallback(
    (goalId: string, input: UpdateGoalInput) => updateMutation.mutateAsync({ goalId, ...input }),
    [updateMutation],
  );

  const deleteGoal = useCallback(
    (goalId: string) => deleteMutation.mutateAsync(goalId),
    [deleteMutation],
  );

  return {
    goals: query.data?.goals ?? [],
    loading: query.isLoading,
    creating: createMutation.isPending,
    updating: updateMutation.isPending,
    deleting: deleteMutation.isPending,
    createGoal,
    updateGoal,
    deleteGoal,
    refetch: query.refetch,
  };
}
