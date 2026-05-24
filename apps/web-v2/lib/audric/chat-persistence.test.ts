/**
 * Unit tests for `lib/audric/chat-persistence.ts` —
 * SPEC_AI_SDK_HARDENING P5.1 (Round 3 fold-in).
 *
 * Five regression tests for the chat-persistence layer:
 *
 *   1. `saveMessages` upsert handles AI SDK v6 `approval-requested →
 *      output-available` state transitions on the same `id` — the
 *      P0-A continuation fix.
 *   2. `saveMessages` short-circuits on empty `messages[]` — guards
 *      the abort-safe input-only persistence path (route.ts:2056).
 *   3. `convertToUIMessages` preserves the full part payload (incl.
 *      `approval.id`, `description`, `modifiableFields`) — cold-reload
 *      rehydration of confirm-tier tool calls.
 *   4. `isBundleSpent` decision matrix — all-pending vs partially-spent
 *      vs fully-spent vs zero-matched (stale marker).
 *   5. `truncateMessagesAfter` — strict-greater-than `createdAt` delete,
 *      plus the `messageId: null` "edit-the-first-message" wipe case.
 *
 * Prisma is mocked via `vi.mock("@/lib/prisma")`. We exercise the
 * Prisma call shape (where clause, data payload) — not the DB. The
 * underlying Prisma queries are exercised in production every turn;
 * mocking is the right fidelity for "did this helper construct the
 * right call?" assertions.
 *
 * Mock typing: each Prisma method is a `vi.fn()` with no static
 * signature — the helpers only use the runtime behavior. We treat the
 * mocked module as `any` at the boundary so the test bodies stay
 * focused on shape assertions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  chat: {
    upsert: vi.fn(),
  },
  message: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.chat.upsert.mockResolvedValue({});
  mockPrisma.message.upsert.mockResolvedValue({});
  mockPrisma.message.findFirst.mockResolvedValue(null);
  mockPrisma.message.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.message.count.mockResolvedValue(0);
});

// ---------------------------------------------------------------------------
// Test 1 — saveMessages upserts on the same id (P0-A continuation fix)
// ---------------------------------------------------------------------------

describe("saveMessages — per-row upsert (P0-A continuation)", () => {
  it("calls prisma.message.upsert for each message with both create + update payloads", async () => {
    const { saveMessages } = await import("./chat-persistence");

    const now = new Date("2026-05-24T12:00:00Z");
    await saveMessages({
      chatOwnerSuiAddress: "0xowner",
      messages: [
        {
          id: "msg-1",
          chatId: "chat-1",
          role: "user",
          parts: [{ type: "text", text: "hi" }],
          attachments: [],
          createdAt: now,
        },
        {
          id: "msg-2",
          chatId: "chat-1",
          role: "assistant",
          parts: [
            {
              type: "tool-save_deposit",
              toolCallId: "call-1",
              state: "output-available",
              input: { amount: 10 },
              output: { txDigest: "0xabc" },
            },
          ],
          attachments: [],
          createdAt: now,
        },
      ],
    });

    expect(mockPrisma.message.upsert).toHaveBeenCalledTimes(2);

    // Both call sites pass `where: { id: m.id }`, with `create` AND
    // `update` payloads holding the same parts/attachments. The update
    // branch is what handles `approval-requested → output-available`
    // on the same id — verify it.
    const calls = mockPrisma.message.upsert.mock.calls;
    expect(calls[0]?.[0]).toMatchObject({
      where: { id: "msg-1" },
      create: { id: "msg-1", chatId: "chat-1", role: "user" },
      update: { role: "user" },
    });
    expect(calls[1]?.[0]).toMatchObject({
      where: { id: "msg-2" },
      create: { id: "msg-2", role: "assistant" },
      update: { role: "assistant" },
    });
    // Assistant part round-trips the resolved tool state.
    const updatePayload = calls[1]?.[0] as {
      update: { parts: Array<{ state: string }> };
    };
    expect(updatePayload.update.parts[0]?.state).toBe("output-available");
  });

  it("lazy-upserts the Chat row before message upserts so first-turn saves don't FK-fail", async () => {
    const { saveMessages } = await import("./chat-persistence");

    await saveMessages({
      chatOwnerSuiAddress: "0xowner",
      messages: [
        {
          id: "msg-1",
          chatId: "chat-1",
          role: "user",
          parts: [{ type: "text", text: "hi" }],
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    expect(mockPrisma.chat.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.chat.upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "chat-1" },
      create: {
        id: "chat-1",
        userSuiAddress: "0xowner",
        visibility: "private",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Test 2 — saveMessages short-circuits on empty messages
// (input-only abort-safe persistence path: route.ts:2056 calls
// `saveMessages([input + outputs])`; if the stream errors before any
// outputs land, the caller may still pass an empty list — assert
// short-circuit semantics so the function doesn't FK-fail the lazy
// chat-row upsert with no data.)
// ---------------------------------------------------------------------------

describe("saveMessages — empty-array short-circuit (error-mid-stream)", () => {
  it("does not touch the DB when messages is empty", async () => {
    const { saveMessages } = await import("./chat-persistence");

    await saveMessages({
      chatOwnerSuiAddress: "0xowner",
      messages: [],
    });

    expect(mockPrisma.chat.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.message.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — convertToUIMessages preserves approval-requested payload
// (cold-reload of HITL flow — `approval.id`, `description`,
// `modifiableFields` MUST round-trip through DB → UIMessage)
// ---------------------------------------------------------------------------

describe("convertToUIMessages — cold-reload of approval-requested parts", () => {
  it("preserves the full tool part payload including approval / description / modifiableFields", async () => {
    const { convertToUIMessages } = await import("@/lib/utils");

    const persistedParts = [
      { type: "text", text: "Confirm to save 10 USDC?" },
      {
        type: "tool-save_deposit",
        toolCallId: "call-1",
        state: "approval-requested",
        input: { amount: 10, asset: "USDC" },
        approval: { id: "attempt-uuid-1" },
        description: "Save 10 USDC into NAVI",
        modifiableFields: [{ name: "amount", kind: "amount", asset: "USDC" }],
      },
    ];

    const ui = convertToUIMessages([
      {
        id: "msg-asst",
        chatId: "chat-1",
        role: "assistant",
        parts: persistedParts,
        attachments: [],
        createdAt: new Date("2026-05-24T12:00:00Z"),
      },
    ]);

    expect(ui).toHaveLength(1);
    expect(ui[0]?.id).toBe("msg-asst");
    expect(ui[0]?.role).toBe("assistant");
    // The parts pass-through is the load-bearing contract — a regression
    // here would strip `approval.id` (forward-compat alias for
    // `attemptId`) and break HITL resume.
    expect(ui[0]?.parts).toEqual(persistedParts);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — isBundleSpent decision matrix
// ---------------------------------------------------------------------------

describe("isBundleSpent — bundle cold-reload decision matrix", () => {
  const marker = {
    steps: [
      {
        toolCallId: "tc-1",
        approvalId: "ap-1",
        toolName: "swap_execute",
        input: {},
        description: "",
        modifiableFields: [],
      },
      {
        toolCallId: "tc-2",
        approvalId: "ap-2",
        toolName: "save_deposit",
        input: {},
        description: "",
        modifiableFields: [],
      },
    ],
  };

  it("returns false when all constituent steps are still approval-requested (fresh load)", async () => {
    const { isBundleSpent } = await import("./bundle-status");
    const parts = [
      {
        type: "tool-swap_execute",
        toolCallId: "tc-1",
        state: "approval-requested",
      },
      {
        type: "tool-save_deposit",
        toolCallId: "tc-2",
        state: "approval-requested",
      },
    ];
    expect(isBundleSpent(marker, parts as never)).toBe(false);
  });

  it("returns false when any step is still approval-requested (partial mid-confirm refresh)", async () => {
    const { isBundleSpent } = await import("./bundle-status");
    const parts = [
      {
        type: "tool-swap_execute",
        toolCallId: "tc-1",
        state: "output-available",
      },
      {
        type: "tool-save_deposit",
        toolCallId: "tc-2",
        state: "approval-requested",
      },
    ];
    expect(isBundleSpent(marker, parts as never)).toBe(false);
  });

  it("returns true when every step is past approval-requested (spent bundle)", async () => {
    const { isBundleSpent } = await import("./bundle-status");
    const parts = [
      {
        type: "tool-swap_execute",
        toolCallId: "tc-1",
        state: "output-available",
      },
      {
        type: "tool-save_deposit",
        toolCallId: "tc-2",
        state: "output-available",
      },
    ];
    expect(isBundleSpent(marker, parts as never)).toBe(true);
  });

  it("returns false when zero steps matched (stale marker — fallback path)", async () => {
    const { isBundleSpent } = await import("./bundle-status");
    const parts = [
      {
        type: "tool-unrelated",
        toolCallId: "tc-other",
        state: "output-available",
      },
    ];
    expect(isBundleSpent(marker, parts as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — truncateMessagesAfter (P5.1 new helper)
// ---------------------------------------------------------------------------

describe("truncateMessagesAfter — edit-flow orphan cleanup", () => {
  it("deletes messages strictly after the anchor's createdAt", async () => {
    const { truncateMessagesAfter } = await import("./chat-persistence");

    const anchorCreatedAt = new Date("2026-05-24T12:00:00Z");
    mockPrisma.message.findFirst.mockResolvedValue({
      createdAt: anchorCreatedAt,
    });
    mockPrisma.message.deleteMany.mockResolvedValue({ count: 3 });

    const deleted = await truncateMessagesAfter({
      chatId: "chat-1",
      messageId: "anchor-msg",
    });

    expect(deleted).toBe(3);
    expect(mockPrisma.message.findFirst).toHaveBeenCalledWith({
      where: { id: "anchor-msg", chatId: "chat-1" },
      select: { createdAt: true },
    });
    expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith({
      where: {
        chatId: "chat-1",
        createdAt: { gt: anchorCreatedAt },
      },
    });
  });

  it("returns 0 without deleting when the anchor doesn't exist (idempotent on race)", async () => {
    const { truncateMessagesAfter } = await import("./chat-persistence");

    mockPrisma.message.findFirst.mockResolvedValue(null);

    const deleted = await truncateMessagesAfter({
      chatId: "chat-1",
      messageId: "ghost-msg",
    });

    expect(deleted).toBe(0);
    expect(mockPrisma.message.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes every message in the chat when messageId is null (edit-the-first-message case)", async () => {
    const { truncateMessagesAfter } = await import("./chat-persistence");

    mockPrisma.message.deleteMany.mockResolvedValue({ count: 7 });

    const deleted = await truncateMessagesAfter({
      chatId: "chat-1",
      messageId: null,
    });

    expect(deleted).toBe(7);
    expect(mockPrisma.message.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1" },
    });
  });
});
