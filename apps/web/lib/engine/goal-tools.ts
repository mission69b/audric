import { buildTool } from '@t2000/engine';
import type { ToolContext } from '@t2000/engine';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const MAX_ACTIVE_GOALS = 10;

async function resolveUserId(walletAddress: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { suiAddress: walletAddress },
    select: { id: true },
  });
  return user?.id ?? null;
}

export const savingsGoalCreateTool = buildTool({
  name: 'savings_goal_create',
  description:
    'Create a new savings goal. The user tells you what they are saving for, how much, and optionally a deadline.',
  inputSchema: z.object({
    name: z.string().max(100).describe('Goal name, e.g. "Trip to Japan"'),
    emoji: z.string().max(4).optional().describe('Emoji for the goal, e.g. "✈️"'),
    targetAmount: z.number().min(0.01).max(1_000_000).describe('Target amount in USD'),
    deadline: z
      .string()
      .optional()
      .describe('Optional deadline as ISO date string, e.g. "2026-12-31"'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Goal name' },
      emoji: { type: 'string', description: 'Emoji for the goal' },
      targetAmount: { type: 'number', description: 'Target amount in USD' },
      deadline: { type: 'string', description: 'Optional deadline (ISO date)' },
    },
    required: ['name', 'targetAmount'],
  },
  isReadOnly: false,
  permissionLevel: 'auto',
  call: async (input, context: ToolContext) => {
    const walletAddress = context.walletAddress;
    if (!walletAddress) throw new Error('No wallet address');

    const userId = await resolveUserId(walletAddress);
    if (!userId) throw new Error('User not found');

    const activeCount = await prisma.savingsGoal.count({
      where: { userId, status: 'active' },
    });
    if (activeCount >= MAX_ACTIVE_GOALS) {
      throw new Error(`Maximum ${MAX_ACTIVE_GOALS} active goals reached. Archive one first.`);
    }

    const goal = await prisma.savingsGoal.create({
      data: {
        userId,
        name: input.name.trim(),
        emoji: input.emoji?.trim() || '🎯',
        targetAmount: input.targetAmount,
        deadline: input.deadline ? new Date(input.deadline) : undefined,
      },
      select: {
        id: true,
        name: true,
        emoji: true,
        targetAmount: true,
        deadline: true,
        status: true,
      },
    });

    return {
      data: {
        ...goal,
        message: `Created savings goal "${goal.emoji} ${goal.name}" for $${goal.targetAmount.toFixed(2)}.`,
      },
    };
  },
});

export const savingsGoalListTool = buildTool({
  name: 'savings_goal_list',
  description:
    'List the user\'s savings goals with progress. Shows active goals by default.',
  inputSchema: z.object({
    includeCompleted: z
      .boolean()
      .optional()
      .describe('Whether to include completed goals (default: false)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      includeCompleted: { type: 'boolean', description: 'Include completed goals' },
    },
    required: [],
  },
  isReadOnly: true,
  permissionLevel: 'auto',
  call: async (input, context: ToolContext) => {
    const walletAddress = context.walletAddress;
    if (!walletAddress) throw new Error('No wallet address');

    const userId = await resolveUserId(walletAddress);
    if (!userId) throw new Error('User not found');

    const statusFilter = input.includeCompleted
      ? { in: ['active', 'completed'] }
      : 'active';

    const goals = await prisma.savingsGoal.findMany({
      where: { userId, status: statusFilter },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        emoji: true,
        targetAmount: true,
        deadline: true,
        status: true,
        createdAt: true,
      },
    });

    const savingsBalance = context.serverPositions?.savings ?? 0;

    const goalsWithProgress = goals.map((g) => {
      const progress = Math.min(savingsBalance / g.targetAmount, 1);
      const pct = Math.round(progress * 100);
      return {
        ...g,
        savingsBalance,
        progress: pct,
        remaining: Math.max(g.targetAmount - savingsBalance, 0),
      };
    });

    return {
      data: {
        goals: goalsWithProgress,
        totalSavings: savingsBalance,
        count: goals.length,
      },
    };
  },
});

export const savingsGoalUpdateTool = buildTool({
  name: 'savings_goal_update',
  description:
    'Update a savings goal — change the name, emoji, target amount, or deadline.',
  inputSchema: z.object({
    goalId: z.string().describe('The goal ID to update'),
    name: z.string().max(100).optional().describe('New name'),
    emoji: z.string().max(4).optional().describe('New emoji'),
    targetAmount: z.number().min(0.01).max(1_000_000).optional().describe('New target amount in USD'),
    deadline: z.string().nullable().optional().describe('New deadline (ISO date) or null to remove'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      goalId: { type: 'string', description: 'Goal ID to update' },
      name: { type: 'string', description: 'New name' },
      emoji: { type: 'string', description: 'New emoji' },
      targetAmount: { type: 'number', description: 'New target amount in USD' },
      deadline: { type: 'string', description: 'New deadline (ISO date) or null' },
    },
    required: ['goalId'],
  },
  isReadOnly: false,
  permissionLevel: 'auto',
  call: async (input, context: ToolContext) => {
    const walletAddress = context.walletAddress;
    if (!walletAddress) throw new Error('No wallet address');

    const userId = await resolveUserId(walletAddress);
    if (!userId) throw new Error('User not found');

    const goal = await prisma.savingsGoal.findFirst({
      where: { id: input.goalId, userId },
    });
    if (!goal) throw new Error('Goal not found');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.emoji !== undefined) data.emoji = input.emoji.trim() || '🎯';
    if (input.targetAmount !== undefined) data.targetAmount = input.targetAmount;
    if (input.deadline !== undefined) {
      data.deadline = input.deadline ? new Date(input.deadline) : null;
    }

    const updated = await prisma.savingsGoal.update({
      where: { id: input.goalId },
      data,
      select: {
        id: true,
        name: true,
        emoji: true,
        targetAmount: true,
        deadline: true,
        status: true,
      },
    });

    return {
      data: {
        ...updated,
        message: `Updated goal "${updated.emoji} ${updated.name}".`,
      },
    };
  },
});

export const savingsGoalDeleteTool = buildTool({
  name: 'savings_goal_delete',
  description: 'Archive (soft-delete) a savings goal.',
  inputSchema: z.object({
    goalId: z.string().describe('The goal ID to archive'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      goalId: { type: 'string', description: 'Goal ID to archive' },
    },
    required: ['goalId'],
  },
  isReadOnly: false,
  permissionLevel: 'auto',
  call: async (input, context: ToolContext) => {
    const walletAddress = context.walletAddress;
    if (!walletAddress) throw new Error('No wallet address');

    const userId = await resolveUserId(walletAddress);
    if (!userId) throw new Error('User not found');

    const goal = await prisma.savingsGoal.findFirst({
      where: { id: input.goalId, userId },
    });
    if (!goal) throw new Error('Goal not found');

    await prisma.savingsGoal.update({
      where: { id: input.goalId },
      data: { status: 'archived' },
    });

    return {
      data: { message: `Archived goal "${goal.emoji} ${goal.name}".` },
    };
  },
});

export const GOAL_TOOLS = [
  savingsGoalCreateTool,
  savingsGoalListTool,
  savingsGoalUpdateTool,
  savingsGoalDeleteTool,
];
