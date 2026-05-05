import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OpenGoalsSidebar, type Goal } from '../OpenGoalsSidebar';

// ─── SPEC 9 v0.1.3 P9.3 — sidebar UI contract ────────────────────────────
//
// Pure presentational tests around the network boundary:
//   - empty list → renders null (no DOM at all)
//   - non-empty list → renders ✦ Open goals lockup + one row per goal
//   - dismiss / complete buttons fire the right host-only API endpoint
//   - refreshKey triggers a refetch
//
// No engine round-trip — this is the host-only mutation surface (R5).

const MOCK_ADDRESS = '0x' + '1'.repeat(64);
const MOCK_JWT = 'h.p.s';

const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  content: 'save $500 by month-end',
  status: 'in_progress',
  sourceSessionId: 'sess-1',
  createdAt: new Date('2026-04-01').toISOString(),
  updatedAt: new Date('2026-05-01').toISOString(),
  completedAt: null,
  ...overrides,
});

const fetchSpy = vi.spyOn(global, 'fetch');

describe('OpenGoalsSidebar', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  it('renders nothing when the list is empty (R4 — no goals = no sidebar)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ goals: [] }), { status: 200 }),
    );
    const { container } = render(
      <OpenGoalsSidebar address={MOCK_ADDRESS} jwt={MOCK_JWT} />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the fetch fails (fail-quiet)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    const { container } = render(
      <OpenGoalsSidebar address={MOCK_ADDRESS} jwt={MOCK_JWT} />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(container.firstChild).toBeNull();
  });

  it('renders the lockup + one row per goal when the list is non-empty', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          goals: [
            makeGoal({ id: 'g1', content: 'save $500 by month-end' }),
            makeGoal({ id: 'g2', content: 'research wstETH yields' }),
          ],
        }),
        { status: 200 },
      ),
    );
    render(<OpenGoalsSidebar address={MOCK_ADDRESS} jwt={MOCK_JWT} />);

    await waitFor(() => screen.getByLabelText('Open goals'));
    expect(screen.getByText(/save \$500 by month-end/)).toBeTruthy();
    expect(screen.getByText(/research wstETH yields/)).toBeTruthy();
    // Lockup chrome.
    expect(screen.getByText(/Open goals/)).toBeTruthy();
  });

  it('renders nothing when jwt is null (auth required)', async () => {
    const { container } = render(
      <OpenGoalsSidebar address={MOCK_ADDRESS} jwt={null} />,
    );
    // Component never fires the fetch when jwt is null.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });

  it('fires POST /api/goals/dismiss when the dismiss button is clicked', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ goals: [makeGoal()] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ goal: { id: 'g1', status: 'dismissed' } }),
          { status: 200 },
        ),
      );

    render(<OpenGoalsSidebar address={MOCK_ADDRESS} jwt={MOCK_JWT} />);

    await waitFor(() => screen.getByLabelText(/Dismiss goal/));
    fireEvent.click(screen.getByLabelText(/Dismiss goal/));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const [url, init] = fetchSpy.mock.calls[1]!;
    expect(url).toBe('/api/goals/dismiss');
    expect(init).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ 'x-zklogin-jwt': MOCK_JWT }),
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ address: MOCK_ADDRESS, goalId: 'g1' });
  });

  it('fires POST /api/goals/complete when the complete button is clicked', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ goals: [makeGoal()] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ goal: { id: 'g1', status: 'completed' } }),
          { status: 200 },
        ),
      );

    render(<OpenGoalsSidebar address={MOCK_ADDRESS} jwt={MOCK_JWT} />);

    await waitFor(() => screen.getByLabelText(/Mark goal complete/));
    fireEvent.click(screen.getByLabelText(/Mark goal complete/));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const [url] = fetchSpy.mock.calls[1]!;
    expect(url).toBe('/api/goals/complete');
  });

  it('removes the row from the list after a successful mutation (optimistic)', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            goals: [
              makeGoal({ id: 'g1', content: 'gone soon' }),
              makeGoal({ id: 'g2', content: 'survives' }),
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ goal: { id: 'g1' } }), { status: 200 }),
      );

    render(<OpenGoalsSidebar address={MOCK_ADDRESS} jwt={MOCK_JWT} />);
    await waitFor(() => screen.getByText('gone soon'));

    fireEvent.click(screen.getByLabelText(/Dismiss goal: gone soon/));

    await waitFor(() => expect(screen.queryByText('gone soon')).toBeNull());
    expect(screen.getByText('survives')).toBeTruthy();
  });

  it('refetches when refreshKey changes', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ goals: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ goals: [makeGoal()] }), { status: 200 }),
      );

    const { rerender } = render(
      <OpenGoalsSidebar address={MOCK_ADDRESS} jwt={MOCK_JWT} refreshKey={0} />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    rerender(
      <OpenGoalsSidebar address={MOCK_ADDRESS} jwt={MOCK_JWT} refreshKey={1} />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
