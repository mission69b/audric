import "server-only";

import { randomBytes } from "node:crypto";
// `db` + the two account queries CALLED in-file (getUserById, recordCredit) need
// local bindings; all nine are re-exported below for `@/lib/db/queries` consumers.
import { db, getUserById, recordCredit } from "@audric/accounts";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lt,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import {
  REFERRAL_REWARD_USD,
  REFERRER_CAP_30D,
} from "@/lib/referral/constants";
import { ChatbotError } from "../errors";
import {
  type Chat,
  chat,
  creditLedger,
  type DBMessage,
  document,
  message,
  referral,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  vote,
} from "./schema";

// The identity · credit · API-key account queries now live in @audric/accounts
// (shared with apps/console — SPEC_T2000_API_V2 §2), using the package's shared
// `db`. Re-exported so existing `@/lib/db/queries` imports keep working unchanged.
export {
  acceptClosedLoopTerms,
  createApiKey,
  getApiKeyByHash,
  getApiUsageByModel,
  getCreditBalanceMicros,
  getTreasuryAddress,
  getUserById,
  listApiKeys,
  listCreditLedger,
  recordApiUsage,
  recordCredit,
  recordStablecoinTopup,
  revokeApiKey,
  setAutoRecharge,
  setStripeCustomerId,
  touchApiKey,
} from "@audric/accounts";

/**
 * Upsert the user row keyed by the zkLogin Sui address (Audric v3). Called at
 * sign-in (session mint) so the Chat/Document FKs resolve, and captures the
 * verified Google email for comms (§6b). Idempotent on re-login.
 */
export async function upsertUser(
  id: string,
  email: string | null
): Promise<{ isNew: boolean; welcomeEmailSentAt: Date | null }> {
  try {
    // `xmax = 0` is true only for a freshly INSERTed row (non-zero on an UPDATE)
    // — the canonical Postgres way to tell insert from update in an upsert.
    // `welcomeEmailSentAt` is the real welcome gate (see markWelcomeSent): a row
    // can pre-exist (migration / pre-feature sign-in / failed send) yet never
    // have been welcomed, so the caller checks the timestamp, not `isNew`.
    const [row] = await db
      .insert(user)
      .values({ id, email, emailVerified: email !== null })
      .onConflictDoUpdate({
        target: user.id,
        set: { email, updatedAt: new Date() },
      })
      .returning({
        isNew: sql<boolean>`(xmax = 0)`,
        welcomeEmailSentAt: user.welcomeEmailSentAt,
      });
    return {
      isNew: row?.isNew ?? false,
      welcomeEmailSentAt: row?.welcomeEmailSentAt ?? null,
    };
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to upsert user");
  }
}

/** Stamp the welcome-sent timestamp exactly once (no-op if already set). Called
 *  after a welcome email actually sends — from the sign-in path and the one-off
 *  blast — so the welcome is sent at most once per user across both. */
export async function markWelcomeSent(userId: string): Promise<void> {
  await db
    .update(user)
    .set({ welcomeEmailSentAt: new Date() })
    .where(and(eq(user.id, userId), isNull(user.welcomeEmailSentAt)));
}

/** Fast collision check for an @audric handle (the DB mirror of the leaf). */
export async function getUserByUsername(
  username: string
): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.username, username))
    .limit(1);
  return row;
}

/** Persist a claimed/changed @audric handle after the on-chain leaf mint. */
export async function setUsername(
  userId: string,
  username: string,
  txDigest: string
) {
  await db
    .update(user)
    .set({
      username,
      usernameUpdatedAt: new Date(),
      usernameMintTxDigest: txDigest,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

/**
 * "Forget all my memories" — bump the user's memory epoch so prior memories are
 * never recalled again (a fresh namespace going forward). Returns the new epoch.
 */
export async function incrementMemoryEpoch(userId: string): Promise<number> {
  const [row] = await db
    .update(user)
    .set({ memoryEpoch: sql`${user.memoryEpoch} + 1`, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({ memoryEpoch: user.memoryEpoch });
  return row?.memoryEpoch ?? 0;
}

// ── Referrals ("Give $X, Get $X") ───────────────────────────────────────────

// No-ambiguous-character alphabet (no 0/O/1/I/L) for human-shareable codes.
const REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const REFERRAL_CODE_LEN = 7;

function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LEN);
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LEN; i++) {
    code += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
  }
  return code;
}

/** Return the user's referral code, lazily generating + persisting one. */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await getUserById(userId);
  if (existing?.referralCode) {
    return existing.referralCode;
  }
  // Retry on the (rare) unique collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const [row] = await db
        .update(user)
        .set({ referralCode: code, updatedAt: new Date() })
        .where(and(eq(user.id, userId), isNull(user.referralCode)))
        .returning({ referralCode: user.referralCode });
      if (row?.referralCode) {
        return row.referralCode;
      }
      // Someone set it concurrently — re-read.
      const fresh = await getUserById(userId);
      if (fresh?.referralCode) {
        return fresh.referralCode;
      }
    } catch {
      // unique collision on the code — loop and try a new one
    }
  }
  throw new ChatbotError(
    "bad_request:database",
    "Failed to generate referral code"
  );
}

/** Attribute a new signup to a referrer (idempotent; self/dup-safe). Call only
 *  for brand-new users, with the `?ref=` code from the cookie. */
export async function attributeReferral(
  refereeId: string,
  code: string
): Promise<void> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return;
  }
  const [referrer] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.referralCode, normalized))
    .limit(1);
  // No such code, or self-referral → ignore.
  if (!referrer || referrer.id === refereeId) {
    return;
  }
  // Set referredBy only if not already set.
  await db
    .update(user)
    .set({ referredBy: referrer.id, updatedAt: new Date() })
    .where(and(eq(user.id, refereeId), isNull(user.referredBy)));
  // One referral row per referee (unique index makes this idempotent).
  await db
    .insert(referral)
    .values({ referrerId: referrer.id, refereeId, code: normalized })
    .onConflictDoNothing({ target: referral.refereeId });
}

/** Reward a referral on the referee's first qualifying PAID action.
 *  Idempotency comes from the ref-unique ledger rows (NOT the status), so the
 *  order is: grant BOTH sides, THEN mark rewarded. If a grant throws, status
 *  stays `pending` and the Stripe retry re-runs this safely (the grant that
 *  already landed is a ref-unique no-op) → self-healing, no partial payout.
 *  Enforces the per-referrer rolling-30d cap. */
export async function rewardReferralOnPaidAction(
  refereeId: string
): Promise<{ rewarded: boolean }> {
  const [pending] = await db
    .select({ referrerId: referral.referrerId })
    .from(referral)
    .where(
      and(eq(referral.refereeId, refereeId), eq(referral.status, "pending"))
    )
    .limit(1);
  if (!pending) {
    return { rewarded: false };
  }

  // Anti-abuse cap: this referrer's ALREADY-rewarded referrals in the last 30d
  // (this row is still pending, so it isn't counted). At/over cap → reject.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [capRow] = await db
    .select({ c: count() })
    .from(referral)
    .where(
      and(
        eq(referral.referrerId, pending.referrerId),
        eq(referral.status, "rewarded"),
        gt(referral.rewardedAt, since)
      )
    );
  if (Number(capRow?.c ?? 0) >= REFERRER_CAP_30D) {
    await db
      .update(referral)
      .set({ status: "rejected" })
      .where(
        and(eq(referral.refereeId, refereeId), eq(referral.status, "pending"))
      );
    return { rewarded: false };
  }

  // Grants first (idempotent via the unique `ref`), then flip status.
  const rewardMicros = REFERRAL_REWARD_USD * 1_000_000;
  await recordCredit({
    userId: pending.referrerId,
    amountMicros: rewardMicros,
    type: "referral",
    description: "Referral reward — your friend joined Audric",
    ref: `referral-referrer:${refereeId}`,
  });
  await recordCredit({
    userId: refereeId,
    amountMicros: rewardMicros,
    type: "referral",
    description: "Referral bonus — welcome to Audric",
    ref: `referral-referee:${refereeId}`,
  });
  await db
    .update(referral)
    .set({ status: "rewarded", rewardedAt: new Date() })
    .where(
      and(eq(referral.refereeId, refereeId), eq(referral.status, "pending"))
    );
  return { rewarded: true };
}

/** Referrer-facing stats for the settings panel. `earned` counts ONLY rewards
 *  earned BY referring (the `referral-referrer:` ledger rows) — not the user's
 *  own welcome bonus. `rank` is their position among referrers by rewarded
 *  count (null until they have ≥1 rewarded referral). */
export async function getReferralStats(referrerId: string): Promise<{
  total: number;
  rewarded: number;
  earnedMicros: number;
  rank: number | null;
}> {
  const [totals] = await db
    .select({
      total: count(),
      rewarded: sql<number>`count(*) filter (where ${referral.status} = 'rewarded')`,
    })
    .from(referral)
    .where(eq(referral.referrerId, referrerId));
  const [earned] = await db
    .select({ total: sum(creditLedger.amountMicros) })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, referrerId),
        eq(creditLedger.type, "referral"),
        like(creditLedger.ref, "referral-referrer:%")
      )
    );

  const rewarded = Number(totals?.rewarded ?? 0);
  let rank: number | null = null;
  if (rewarded > 0) {
    // Count referrers with MORE rewarded referrals than me; rank = that + 1.
    const perReferrer = db
      .select({ c: count().as("c") })
      .from(referral)
      .where(eq(referral.status, "rewarded"))
      .groupBy(referral.referrerId)
      .as("perReferrer");
    const [above] = await db
      .select({ n: count() })
      .from(perReferrer)
      .where(gt(perReferrer.c, rewarded));
    rank = Number(above?.n ?? 0) + 1;
  }

  return {
    total: Number(totals?.total ?? 0),
    rewarded,
    earnedMicros: earned?.total ? Number(earned.total) : 0,
    rank,
  };
}

/** Set (or clear, with null) the user's standing custom instructions. */
export async function setCustomInstructions(
  userId: string,
  instructions: string | null
) {
  await db
    .update(user)
    .set({ customInstructions: instructions, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

export async function setDefaultPaymentMethod(userId: string, pmId: string) {
  await db
    .update(user)
    .set({ defaultPaymentMethodId: pmId, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

export async function setSubscription(
  userId: string,
  opts: {
    tier: "free" | "pro" | "proPlus" | "max";
    status?: string | null;
    stripeSubscriptionId?: string | null;
  }
) {
  await db
    .update(user)
    .set({
      subscriptionTier: opts.tier,
      subscriptionStatus: opts.status ?? null,
      stripeSubscriptionId: opts.stripeSubscriptionId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

/**
 * Blob pathnames referenced by a user's message attachments (Phase 6 purge).
 * Uploaded attachments persist a blob whose ref lives in `message.attachments`
 * (image artifacts are base64 in `document.content`, so they carry no blob).
 * The caller deletes the blobs before/after wiping the rows.
 */
export async function getAttachmentPathnamesByUserId(
  userId: string
): Promise<string[]> {
  const rows = await db
    .select({ attachments: message.attachments })
    .from(message)
    .innerJoin(chat, eq(message.chatId, chat.id))
    .where(eq(chat.userId, userId));

  const paths: string[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.attachments)) {
      continue;
    }
    for (const att of row.attachments) {
      const p = pathnameFromAttachment(att);
      if (p) {
        paths.push(p);
      }
    }
  }
  return paths;
}

/** Recover a blob pathname from a stored attachment (`pathname` or the url's query). */
function pathnameFromAttachment(att: unknown): string | null {
  if (!att || typeof att !== "object") {
    return null;
  }
  const a = att as { pathname?: unknown; url?: unknown };
  if (typeof a.pathname === "string" && a.pathname.length > 0) {
    return a.pathname;
  }
  if (typeof a.url === "string") {
    try {
      return new URL(a.url, "http://local").searchParams.get("pathname");
    } catch {
      return null;
    }
  }
  return null;
}

/** Delete every artifact Document (+ its suggestions) for a user (Phase 6 purge). */
export async function deleteAllDocumentsByUserId({
  userId,
}: {
  userId: string;
}) {
  try {
    await db.delete(suggestion).where(eq(suggestion.userId, userId));
    const deleted = await db
      .delete(document)
      .where(eq(document.userId, userId))
      .returning({ id: document.id });
    return { deletedCount: deleted.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all documents by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<unknown>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

/**
 * Postgres `json`/`text` columns reject U+0000 (NUL). Web-search / scraped tool
 * content (and some model output) can carry NUL bytes, which fail the insert and
 * break the stream. Strip them from nested strings before persisting.
 */
function stripNullBytes<T>(value: T): T {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value).replace(/\\u0000/g, "")) as T;
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    const sanitized = messages.map((m) => ({
      ...m,
      parts: stripNullBytes(m.parts),
      attachments: stripNullBytes(m.attachments),
    }));
    return await db.insert(message).values(sanitized);
  } catch (error) {
    console.error("[saveMessages] insert failed:", error);
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await db.update(message).set({ parts }).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
  model,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
  // For kind:'image' — the image model used (lightbox Details + audit).
  model?: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        model,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

/**
 * The id of this user's most recently created/edited image Document, or null.
 * The robust fallback for `edit_image` when the message-part scan can't pin the
 * conversation's last image (e.g. a weak Auto model produced a messy tool part,
 * or the model switched between turns). DB-backed = model/part-shape independent.
 * Uses the (userId, kind, createdAt) index. Caller gates this to a chat that has
 * shown image activity, so it can't cross-target an unrelated chat's image.
 * (Proper chat-scoping awaits a `Document.chatId` column — tracked follow-up.)
 */
export async function getLatestUserImageDocumentId(
  userId: string
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ id: document.id })
      .from(document)
      .where(and(eq(document.userId, userId), eq(document.kind, "image")))
      .orderBy(desc(document.createdAt))
      .limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Images this user has generated/edited since UTC midnight — the free-tier daily
 * cap derives from the Documents we already write (no counter, no race). Uses
 * the (userId, kind, createdAt) index.
 */
export async function countUserImagesToday(userId: string): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  try {
    const [row] = await db
      .select({ value: count() })
      .from(document)
      .where(
        and(
          eq(document.userId, userId),
          eq(document.kind, "image"),
          gte(document.createdAt, startOfDayUtc)
        )
      );
    return row?.value ?? 0;
  } catch {
    // Fail OPEN on a count error (don't block a paying-or-free user over a DB
    // hiccup) — the cap is a soft guardrail, not a security boundary.
    return 0;
  }
}

/**
 * Today's (UTC) video count for a user — derived from the `video:<id>` ledger
 * rows generate_video writes (paid debit OR a $0 free-tier marker). Powers the
 * 1-free-video/day cap. Fails OPEN on error (soft guardrail, not security).
 */
export async function countUserVideosToday(userId: string): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  try {
    const [row] = await db
      .select({ value: count() })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.userId, userId),
          like(creditLedger.ref, "video:%"),
          gte(creditLedger.createdAt, startOfDayUtc)
        )
      );
    return row?.value ?? 0;
  } catch {
    return 0;
  }
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt))
      .limit(1);

    const latest = docs[0];
    if (!latest) {
      throw new ChatbotError("not_found:database", "Document not found");
    }

    return await db
      .update(document)
      .set({ content })
      .where(and(eq(document.id, id), eq(document.createdAt, latest.createdAt)))
      .returning();
  } catch (_error) {
    if (_error instanceof ChatbotError) {
      throw _error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update document content"
    );
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db.update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (_error) {
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const cutoffTime = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, cutoffTime),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}
