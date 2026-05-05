import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handlePersistentTodos } from '../handle-persistent-todos';

vi.mock('@/lib/prisma', () => {
  const findUnique = vi.fn();
  const findFirst = vi.fn();
  const create = vi.fn();
  return {
    prisma: {
      user: { findUnique },
      goal: { findFirst, create },
    },
    withPrismaRetry: <T>(fn: () => Promise<T>) => fn(),
    __mock: { findUnique, findFirst, create },
  };
});

import * as prismaModule from '@/lib/prisma';

const mocks = (prismaModule as unknown as { __mock: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }).__mock;

const ADDRESS = '0xabc';
const SESSION_ID = 'session-1';
const USER_ID = 'user-cuid-1';

function todo(id: string, label: string, status: 'pending' | 'in_progress' | 'completed' = 'pending', persist?: boolean) {
  return persist === undefined ? { id, label, status } : { id, label, status, persist };
}

function updateTodoMessage(items: Array<ReturnType<typeof todo>>) {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        name: 'update_todo',
        input: { items },
      },
    ],
  };
}

describe('handlePersistentTodos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ id: USER_ID });
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'goal-cuid-1' });
  });

  it('writes a Goal row for each persist:true item', async () => {
    const messages = [
      updateTodoMessage([
        todo('save-500', 'Save $500 by month-end', 'in_progress', true),
        todo('check-balance', 'Check balance', 'pending', false),
        todo('track-apy', 'Track NAVI APY weekly', 'pending', true),
      ]),
    ];

    await handlePersistentTodos(ADDRESS, SESSION_ID, messages);

    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        content: 'Save $500 by month-end',
        status: 'in_progress',
        sourceSessionId: SESSION_ID,
      },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        content: 'Track NAVI APY weekly',
        status: 'in_progress',
        sourceSessionId: SESSION_ID,
      },
    });
  });

  it('does nothing when no items have persist:true', async () => {
    const messages = [
      updateTodoMessage([
        todo('a', 'Step 1', 'in_progress', false),
        todo('b', 'Step 2', 'pending'),
      ]),
    ];

    await handlePersistentTodos(ADDRESS, SESSION_ID, messages);

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('only persists items from the LATEST update_todo call when multiple are emitted', async () => {
    const messages = [
      updateTodoMessage([
        todo('old-goal', 'Older intent', 'in_progress', true),
      ]),
      updateTodoMessage([
        todo('new-goal', 'Newer intent', 'in_progress', true),
      ]),
    ];

    await handlePersistentTodos(ADDRESS, SESSION_ID, messages);

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        content: 'Newer intent',
        status: 'in_progress',
        sourceSessionId: SESSION_ID,
      },
    });
  });

  it('skips Goal creation when an existing row matches (any status)', async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: 'existing' });
    const messages = [
      updateTodoMessage([
        todo('save-500', 'Save $500 by month-end', 'in_progress', true),
      ]),
    ];

    await handlePersistentTodos(ADDRESS, SESSION_ID, messages);

    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns silently when user does not exist', async () => {
    mocks.findUnique.mockResolvedValue(null);
    const messages = [
      updateTodoMessage([
        todo('save-500', 'Save $500 by month-end', 'in_progress', true),
      ]),
    ];

    await handlePersistentTodos(ADDRESS, SESSION_ID, messages);

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('skips items whose label is empty or whitespace only', async () => {
    const messages = [
      updateTodoMessage([
        todo('blank', '   ', 'in_progress', true),
        todo('save-500', 'Save $500 by month-end', 'pending', true),
      ]),
    ];

    await handlePersistentTodos(ADDRESS, SESSION_ID, messages);

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        content: 'Save $500 by month-end',
        status: 'in_progress',
        sourceSessionId: SESSION_ID,
      },
    });
  });

  it('ignores tool_use blocks for tools other than update_todo', async () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'balance_check',
            input: { items: [todo('a', 'Goal-shaped but wrong tool', 'in_progress', true)] },
          },
        ],
      },
    ];

    await handlePersistentTodos(ADDRESS, SESSION_ID, messages);

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('ignores user-role messages even if they shape a tool_use block', async () => {
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_use',
            name: 'update_todo',
            input: { items: [todo('a', 'Should not persist', 'in_progress', true)] },
          },
        ],
      },
    ];

    await handlePersistentTodos(ADDRESS, SESSION_ID, messages);

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('trims the label before writing content', async () => {
    const messages = [
      updateTodoMessage([
        todo('save-500', '  Save $500 by month-end  ', 'in_progress', true),
      ]),
    ];

    await handlePersistentTodos(ADDRESS, SESSION_ID, messages);

    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        content: 'Save $500 by month-end',
        status: 'in_progress',
        sourceSessionId: SESSION_ID,
      },
    });
  });
});
