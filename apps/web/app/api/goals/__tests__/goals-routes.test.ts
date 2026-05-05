import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── SPEC 9 v0.1.3 P9.3 — host-only goal mutation surface ────────────────
// Per v0.1.3 R5 the engine has NO `dismiss_goal` / `complete_goal` tools.
// These three routes are the entire mutation surface for cross-session
// `Goal` rows; coverage here is the only safety net.

const mockUserFindUnique = vi.fn();
const mockGoalFindMany = vi.fn();
const mockGoalFindFirst = vi.fn();
const mockGoalUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    goal: {
      findMany: (...args: unknown[]) => mockGoalFindMany(...args),
      findFirst: (...args: unknown[]) => mockGoalFindFirst(...args),
      update: (...args: unknown[]) => mockGoalUpdate(...args),
    },
  },
}));

// validateJwt only decodes the JWT structurally — no signature check —
// so a 3-part base64 string with a valid JSON payload is enough.
function fakeJwt(payload: Record<string, unknown> = { sub: 'test-user' }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = 'sig';
  return `${header}.${body}.${sig}`;
}

const VALID_ADDRESS = '0x' + '1'.repeat(64);

function buildGetRequest(
  pathQuery: string,
  jwt: string | null = fakeJwt(),
): NextRequest {
  const headers: Record<string, string> = {};
  if (jwt) headers['x-zklogin-jwt'] = jwt;
  return new NextRequest(`http://localhost${pathQuery}`, {
    method: 'GET',
    headers,
  });
}

function buildPostRequest(
  path: string,
  body: unknown,
  jwt: string | null = fakeJwt(),
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers['x-zklogin-jwt'] = jwt;
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('GET /api/goals/list', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../list/route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 401 when no JWT header is present', async () => {
    const res = await GET(buildGetRequest(`/api/goals/list?address=${VALID_ADDRESS}`, null));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid address', async () => {
    const res = await GET(buildGetRequest('/api/goals/list?address=not-an-address'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when user is not found', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    const res = await GET(buildGetRequest(`/api/goals/list?address=${VALID_ADDRESS}`));
    expect(res.status).toBe(404);
  });

  it('returns goals for the authenticated user with default in_progress filter', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1' });
    const goals = [
      {
        id: 'g1',
        content: 'save $500 by month-end',
        status: 'in_progress',
        sourceSessionId: 'sess-1',
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-05-01'),
        completedAt: null,
      },
    ];
    mockGoalFindMany.mockResolvedValueOnce(goals);

    const res = await GET(buildGetRequest(`/api/goals/list?address=${VALID_ADDRESS}`));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.goals).toHaveLength(1);
    expect(body.goals[0].id).toBe('g1');

    // Verify default status filter is 'in_progress' (the sidebar's primary use case).
    expect(mockGoalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', status: 'in_progress' },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('honours ?status=completed override', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1' });
    mockGoalFindMany.mockResolvedValueOnce([]);

    await GET(buildGetRequest(`/api/goals/list?address=${VALID_ADDRESS}&status=completed`));

    expect(mockGoalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', status: 'completed' },
      }),
    );
  });

  it('falls back to in_progress for unknown ?status values (no enum injection)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1' });
    mockGoalFindMany.mockResolvedValueOnce([]);

    await GET(buildGetRequest(`/api/goals/list?address=${VALID_ADDRESS}&status=arbitrary'; DROP TABLE`));

    expect(mockGoalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', status: 'in_progress' },
      }),
    );
  });
});

describe('POST /api/goals/dismiss', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../dismiss/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 401 without JWT', async () => {
    const res = await POST(
      buildPostRequest('/api/goals/dismiss', { address: VALID_ADDRESS, goalId: 'g1' }, null),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing goalId', async () => {
    const res = await POST(
      buildPostRequest('/api/goals/dismiss', { address: VALID_ADDRESS }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('goalId');
  });

  it('returns 404 when goal does not belong to the user', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1' });
    mockGoalFindFirst.mockResolvedValueOnce(null);

    const res = await POST(
      buildPostRequest('/api/goals/dismiss', { address: VALID_ADDRESS, goalId: 'g-other' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when goal is already completed (cannot dismiss after completion)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1' });
    mockGoalFindFirst.mockResolvedValueOnce({ id: 'g1', status: 'completed' });

    const res = await POST(
      buildPostRequest('/api/goals/dismiss', { address: VALID_ADDRESS, goalId: 'g1' }),
    );
    expect(res.status).toBe(409);
  });

  it('updates status to dismissed on success', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1' });
    mockGoalFindFirst.mockResolvedValueOnce({ id: 'g1', status: 'in_progress' });
    mockGoalUpdate.mockResolvedValueOnce({
      id: 'g1',
      status: 'dismissed',
      updatedAt: new Date(),
    });

    const res = await POST(
      buildPostRequest('/api/goals/dismiss', { address: VALID_ADDRESS, goalId: 'g1' }),
    );
    expect(res.status).toBe(200);

    expect(mockGoalUpdate).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { status: 'dismissed' },
      select: expect.any(Object),
    });
  });
});

describe('POST /api/goals/complete', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../complete/route');
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  it('returns 409 when goal is already dismissed (cannot complete after dismissal)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1' });
    mockGoalFindFirst.mockResolvedValueOnce({ id: 'g1', status: 'dismissed' });

    const res = await POST(
      buildPostRequest('/api/goals/complete', { address: VALID_ADDRESS, goalId: 'g1' }),
    );
    expect(res.status).toBe(409);
  });

  it('updates status to completed and stamps completedAt', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-1' });
    mockGoalFindFirst.mockResolvedValueOnce({ id: 'g1', status: 'in_progress' });
    mockGoalUpdate.mockResolvedValueOnce({
      id: 'g1',
      status: 'completed',
      updatedAt: new Date(),
      completedAt: new Date(),
    });

    const res = await POST(
      buildPostRequest('/api/goals/complete', { address: VALID_ADDRESS, goalId: 'g1' }),
    );
    expect(res.status).toBe(200);

    expect(mockGoalUpdate).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: expect.objectContaining({
        status: 'completed',
        completedAt: expect.any(Date),
      }),
      select: expect.any(Object),
    });
  });
});
