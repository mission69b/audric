import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import * as Crypto from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Conversation,
  type ConversationGroup,
  modelId,
} from "@/app-state/catalog";
import { authHeader } from "@/auth/session";
import { useAuth } from "@/auth/useAuth";
import { generateAPIUrl } from "@/lib/api-url";
import type { ChatMessage } from "@/lib/types";

// A faithful port of the mobile prototype's single `Component` state machine
// (`Audric Mobile Design Brief/Audric Mobile.dc.html`). The prototype runs the
// whole app from one component: a `tab` swaps the content area in place, a drawer
// slides over it, and every other surface is a sheet toggled by a boolean. This
// store holds that exact state + the same action methods so the RN shell, views,
// and sheets stay a 1:1 mapping of the design. It is demo/mock behaviour (the
// same the prototype ships); the real web-v3 SSE transport + wallet calls swap in
// behind these actions later without changing the UI.

export type Tab = "chat" | "wallet" | "settings" | "skills";
export type Visibility = "private" | "public";
export type SendStage = "confirm" | "sending" | "success";
export type ConfirmKind = "delete" | "purge" | "forget" | "signout" | null;

// The chat message model is now the Vercel AI SDK `ChatMessage` (role + parts[],
// see `@/lib/types`) — the same wire shape as web-v3. Text turns stream real text
// parts; the prototype's demo surfaces (wallet/image/video/artifact) ride along as
// typed `metadata.demo` on an assistant message so the whole thread is ONE list.

// Demo wallet figures — identical to the prototype.
export const SPENDABLE_USDC = 124.5;
export const GAS_SUI = 0.82;

// Onboarding entry (see AGENTS/CLAUDE Phase-0). The real zkLogin `gate` is the
// production sign-in, so once a user reaches the app they are ALREADY signed in —
// showing the prototype's mock "Continue with Google" Welcome step again would be
// a second, fake sign-in. In production we therefore start onboarding at step 1
// (Privacy → Wallet → FaceID). In __DEV__ we start at step 0 so the full 4-step
// prototype flow (incl. the mock Welcome) stays previewable via the gate's dev
// bypass, without touching real auth.
const ONBOARD_START_STEP = __DEV__ ? 0 : 1;

let seq = 0;
const uid = (suffix: string) => `${(seq += 1)}${suffix}`;

type Store = {
  // navigation
  tab: Tab;
  setTab: (t: Tab) => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;

  // chat
  messages: ChatMessage[];
  draft: string;
  setDraft: (v: string) => void;
  /** Awaiting the first token (or a demo turn's delay) — drives the thinking dots. */
  thinking: boolean;
  /** A turn is in flight (awaiting OR streaming OR demo) — drives the Stop button. */
  busy: boolean;
  pendingMedia: "image" | "video" | null;
  worklogOpen: boolean;
  toggleWorklog: () => void;
  send: (text?: string) => void;
  stop: () => void;
  newChat: () => void;
  askSuggestion: (t: string) => void;

  // chat history (real, DB-backed — replaces the prototype's static CONVERSATIONS).
  // Grouped by recency (Today / Yesterday / …), newest first; `active` flags the
  // open thread. Loaded on mount + on drawer open + after each completed turn.
  history: ConversationGroup[];
  /** Open a past thread: load its messages, swap the chat to it, go to the chat tab. */
  openChat: (id: string) => void;
  /** Delete a thread (owner-checked) — optimistic locally, then the server. */
  deleteChat: (id: string) => void;

  // model switcher
  model: string;
  modelSheet: boolean;
  modelQuery: string;
  openModel: () => void;
  closeModel: () => void;
  pickModel: (m: string) => void;
  setModelQuery: (q: string) => void;

  // visibility
  visibility: Visibility;
  visSheet: boolean;
  openVis: () => void;
  closeVis: () => void;
  setVisibility: (v: Visibility) => void;

  // composer extras
  attachDemo: boolean;
  toggleAttach: () => void;
  memoryOn: boolean;
  toggleMemory: () => void;
  ctxOpen: boolean;
  openCtx: () => void;
  closeCtx: () => void;
  runSlash: (name: string) => void;

  // media viewers
  imageFull: boolean;
  imageDetails: boolean;
  openImageFull: () => void;
  closeImageFull: () => void;
  toggleImageDetails: () => void;
  artifactOpen: boolean;
  openArtifact: () => void;
  closeArtifact: () => void;

  // wallet
  walletView: "home";
  setWallet: (v: "home") => void;
  sendSheet: boolean;
  openSend: () => void;
  closeSend: () => void;
  receiveSheet: boolean;
  openReceive: () => void;
  closeReceive: () => void;
  stage: SendStage;
  amount: number;
  incAmount: () => void;
  decAmount: () => void;
  recipient: string;
  toggleRecipient: () => void;
  confirmSend: () => void;

  // settings
  settingsView: "home" | "billing";
  setSettings: (v: "home" | "billing") => void;
  goBilling: () => void;
  goSettingsHome: () => void;
  plansSheet: boolean;
  openPlans: () => void;
  closePlans: () => void;
  billAsset: "USDC" | "SUI";
  setBillAsset: (a: "USDC" | "SUI") => void;
  autoRecharge: boolean;
  toggleAutoRecharge: () => void;
  termsInfoOpen: boolean;
  toggleTermsInfo: () => void;

  // account & misc sheets
  referralSheet: boolean;
  openReferral: () => void;
  closeReferral: () => void;
  customSheet: boolean;
  customText: string;
  openCustom: () => void;
  closeCustom: () => void;
  onCustomText: (v: string) => void;
  handleSheet: boolean;
  handleText: string;
  openHandle: () => void;
  closeHandle: () => void;
  onHandleText: (v: string) => void;
  accountMenu: boolean;
  openAccount: () => void;
  closeAccount: () => void;
  chatMenu: string | null;
  openChatMenu: (id: string) => void;
  closeChatMenu: () => void;
  confirmKind: ConfirmKind;
  askConfirm: (k: ConfirmKind) => void;
  closeConfirm: () => void;
  doConfirm: () => void;

  // onboarding (prototype first-launch flow → OnboardScreen)
  onboarded: boolean;
  step: number;
  onboardNext: () => void;
  finishOnboarding: () => void;
  replayOnboarding: () => void;

  // guest nudge (anonymous "try before signup")
  guest: boolean;
  anonTurns: number;
  nudge: boolean;
  openNudge: () => void;
  closeNudge: () => void;
};

const AppStateContext = createContext<Store | null>(null);

function classify(text: string): {
  kind: "text" | "image" | "video" | "artifact" | "wallet";
} {
  const lc = text.toLowerCase();
  if (/\b(image|picture|draw|logo|illustration|photo|art|render|generate)\b/.test(lc))
    return { kind: "image" };
  if (/\b(video|animate|clip|motion|sunrise)\b/.test(lc)) return { kind: "video" };
  if (
    /\b(document|artifact|essay|article|draft|announcement|write|code|function|script|table|spreadsheet|sheet|report)\b/.test(
      lc
    )
  )
    return { kind: "artifact" };
  if (/balance|usdc|wallet|hold|spend|money/.test(lc)) return { kind: "wallet" };
  return { kind: "text" };
}

// Builds the prototype's canned assistant reply for a NON-text (demo) turn as a
// `ChatMessage`: a metadata-tagged assistant message carrying the render kind + a
// short text part. No model call — these surfaces are still mock (in web-v3 they
// are real tool-call parts), but they share the same parts-based message list.
function buildDemoReply(
  kind: "image" | "video" | "artifact" | "wallet"
): ChatMessage {
  const base = { id: uid("a"), role: "assistant" as const };
  if (kind === "wallet")
    return {
      ...base,
      metadata: { demo: "wallet" },
      parts: [
        {
          type: "text",
          text: "You're holding 124.50 USDC that's spendable, plus 0.82 SUI reserved for gas. Want me to send some?",
        },
      ],
    };
  if (kind === "image")
    return {
      ...base,
      metadata: { demo: "image" },
      parts: [
        {
          type: "text",
          text: "Here's your image — tap it to view full screen, or download it.",
        },
      ],
    };
  if (kind === "video")
    return {
      ...base,
      metadata: { demo: "video" },
      parts: [
        {
          type: "text",
          text: "Here's your clip. Tap play to preview, or download the MP4.",
        },
      ],
    };
  return {
    ...base,
    metadata: {
      demo: "artifact",
      artTitle: "Launch announcement",
      artKind: "Document",
    },
    parts: [
      {
        type: "text",
        text: "I drafted this as a document you can edit — open it to make changes.",
      },
    ],
  };
}

// Raw history row as the /api/history route returns it (createdAt is an ISO string).
type HistoryRow = { id: string; title: string; createdAt: string };

// Group threads into the same recency buckets web-v3's sidebar uses (Today /
// Yesterday / Last 7 days / Last 30 days / Older), preserving the server's
// newest-first order and dropping empty buckets. `active` marks the open thread.
const HISTORY_GROUPS = [
  "Today",
  "Yesterday",
  "Last 7 days",
  "Last 30 days",
  "Older",
] as const;

function groupByRecency(
  rows: HistoryRow[],
  activeId: string
): ConversationGroup[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const dayMs = 86_400_000;
  const buckets: Record<string, Conversation[]> = {};
  for (const r of rows) {
    const t = new Date(r.createdAt).getTime();
    let label: (typeof HISTORY_GROUPS)[number];
    if (Number.isNaN(t)) label = "Older";
    else if (t >= startOfToday) label = "Today";
    else if (t >= startOfToday - dayMs) label = "Yesterday";
    else if (t >= startOfToday - 7 * dayMs) label = "Last 7 days";
    else if (t >= startOfToday - 30 * dayMs) label = "Last 30 days";
    else label = "Older";
    (buckets[label] ??= []).push({
      id: r.id,
      title: r.title,
      active: r.id === activeId,
    });
  }
  return HISTORY_GROUPS.filter((g) => buckets[g]?.length).map((g) => ({
    group: g,
    items: buckets[g],
  }));
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [tab, setTabRaw] = useState<Tab>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [draft, setDraft] = useState("");
  // True while a demo (non-text) turn's 1.6s delay is running — the text turns get
  // their "awaiting" state from the useChat `status` instead (see below).
  const [mockPending, setMockPending] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<"image" | "video" | null>(null);
  const [worklogOpen, setWorklogOpen] = useState(false);

  const [model, setModel] = useState("Auto");
  const [modelSheet, setModelSheet] = useState(false);
  const [modelQuery, setModelQueryState] = useState("");

  const [visibility, setVisibilityState] = useState<Visibility>("private");
  const [visSheet, setVisSheet] = useState(false);

  const [attachDemo, setAttachDemo] = useState(false);
  // Memory is opt-in / OFF by default — the product's privacy promise (and the
  // app's own onboarding + Settings copy). Deliberately diverges from the
  // prototype, which shows it pre-enabled.
  const [memoryOn, setMemoryOn] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);

  const [imageFull, setImageFull] = useState(false);
  const [imageDetails, setImageDetails] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);

  const [walletView, setWalletView] = useState<"home">("home");
  const [sendSheet, setSendSheet] = useState(false);
  const [receiveSheet, setReceiveSheet] = useState(false);
  const [stage, setStage] = useState<SendStage>("confirm");
  const [amount, setAmount] = useState(25);
  const [recipient, setRecipient] = useState("alice.audric");

  const [settingsView, setSettingsView] = useState<"home" | "billing">("home");
  const [plansSheet, setPlansSheet] = useState(false);
  const [billAsset, setBillAssetState] = useState<"USDC" | "SUI">("USDC");
  const [autoRecharge, setAutoRecharge] = useState(false);
  const [termsInfoOpen, setTermsInfoOpen] = useState(false);

  const [referralSheet, setReferralSheet] = useState(false);
  const [customSheet, setCustomSheet] = useState(false);
  const [customText, setCustomText] = useState("");
  const [handleSheet, setHandleSheet] = useState(false);
  const [handleText, setHandleText] = useState("");
  const [accountMenu, setAccountMenu] = useState(false);
  const [chatMenu, setChatMenu] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);

  // Onboarding — the app boots into the first-launch flow (prototype default
  // `onboarded:false`). Real sign-in already happened at the gate; the steps
  // only introduce the app ("Get started" advances, "Skip for now" finishes).
  const [onboarded, setOnboarded] = useState(false);
  const [step, setStep] = useState(ONBOARD_START_STEP);
  // Guest persona (anonymous "try before signup"): free models, no persistence,
  // a sign-in nudge after a few turns. Flipped by the onboarding actions.
  const [guest, setGuest] = useState(false);
  const [anonTurns, setAnonTurns] = useState(0);
  const [nudge, setNudge] = useState(false);

  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Real AI transport (Vercel AI SDK) ------------------------------------
  // The text conversation streams through the provider seam via the Expo Router
  // API route, mirroring web-v3's `useChat` + `DefaultChatTransport`. `messages`
  // (UIMessage[] with parts[]) is the single render list; demo turns are injected
  // into it by `send` (see below). Only the provider behind the route differs from
  // production — the client shape is final.
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  // The current thread id — a real uuid because `Chat.id`/`Message_v2.id` are uuid
  // columns. New chat / clear / delete start a fresh thread (see the reset helpers).
  const [chatId, setChatId] = useState(() => Crypto.randomUUID());

  // The onboarded identity (Sui address) each turn is saved under. Read live inside
  // the once-built transport via a ref, exactly like the model. The auth gate means a
  // session is always present in (app); `undefined` would make the route skip
  // persistence (guest-style), so this is the real user id in normal use.
  const { session } = useAuth();
  const userIdRef = useRef<string | undefined>(session?.address);
  useEffect(() => {
    userIdRef.current = session?.address;
  }, [session?.address]);

  // The `audric_session` token that authenticates the data routes, read live at
  // request time (same ref pattern as the model/userId). Absent on a dev-bypass
  // session → `authHeader` yields no header → the route's dev fallback applies.
  const tokenRef = useRef<string | undefined>(session?.token);
  useEffect(() => {
    tokenRef.current = session?.token;
  }, [session?.token]);

  // The prototype's in-app "guest" persona (the Skip-for-now path). It is NOT real
  // auth — a session always exists behind the auth gate — but it drives the app's own
  // "Guest — chats aren't saved" promise. Honor that: a guest turn sends NO userId, so
  // the route skips persistence, and guest history stays empty (web-v3 parity: an
  // anonymous session gets no persistence + no history). Read at send-time via a ref.
  const guestRef = useRef(guest);
  useEffect(() => {
    guestRef.current = guest;
  }, [guest]);

  // Built once — `expo/fetch` streams the response body (RN's global fetch can't).
  // `prepareSendMessagesRequest` forwards the selected model each turn via a ref,
  // exactly like web-v3's transport.
  // biome-ignore lint/correctness/useExhaustiveDependencies: transport is created once; the model is read live via modelRef.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: generateAPIUrl("/api/chat"),
        fetch: expoFetch as unknown as typeof globalThis.fetch,
        // Mobile is a stateless BFF, so it sends the FULL history every turn (web-v3
        // sends only the latest `message` + re-hydrates the rest from its DB). When
        // chat persistence is grafted onto the route this body contract changes to
        // match web-v3. Demo turns (wallet/image/video/artifact) are mock UI state —
        // their fabricated content (e.g. fake balances) must NEVER reach the model as
        // context, so they are stripped here. `selectedChatModel` is the canonical
        // web-v3 model id, not the display name.
        prepareSendMessagesRequest: ({ messages: reqMessages, id }) => ({
          // Bearer authenticates the turn server-side; the route derives the real
          // identity from the verified token, not the body `userId`. A guest sends
          // none — matching its no-`userId` body, the turn is unauthenticated (dev
          // fallback / deferred anon quota) and never persisted.
          headers: guestRef.current ? {} : authHeader(tokenRef.current),
          body: {
            id,
            // The onboarded identity — the route persists the thread under it (skips
            // persistence when absent). Read live from the ref, like the model. A guest
            // persona sends none, so the route treats the turn as anonymous (no save).
            userId: guestRef.current ? undefined : userIdRef.current,
            messages: reqMessages.filter((m) => !m.metadata?.demo),
            selectedChatModel: modelId(modelRef.current),
          },
        }),
      }),
    []
  );

  const {
    messages,
    setMessages: setChatMessages,
    sendMessage,
    status,
    stop: stopStream,
  } = useChat<ChatMessage>({
    // Keyed by the uuid thread id so a "new chat" (fresh id) swaps to an empty list;
    // opening a past thread sets this id + rehydrates its messages from the DB.
    id: chatId,
    // Every user/assistant message gets a uuid id — the shape the DB columns require.
    generateId: () => Crypto.randomUUID(),
    transport,
    onError: (err) => {
      // Streaming failed (network / provider) — clear placeholders; the partial
      // assistant message (if any) stays so the user sees what arrived. Prod
      // surfaces a toast here.
      console.warn("[chat] stream error:", err?.message ?? String(err));
      setMockPending(false);
      setPendingMedia(null);
    },
  });

  // Thinking dots show only BEFORE the first token ('submitted') or during a demo
  // turn's delay; once tokens stream in, the assistant bubble renders them.
  const thinking = status === "submitted" || mockPending;
  // Busy = a turn is in flight → composer shows Stop, context ring hides.
  const busy = status === "submitted" || status === "streaming" || mockPending;

  // Cancel any in-flight reply — the mock timer (media/wallet/artifact turns) AND a
  // real model request — so a late-arriving response can't repopulate a thread that
  // was just cleared (clear / delete / purge / new chat / onboarding reset). Also
  // drops the thinking + media placeholders.
  const cancelPending = useCallback(() => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    replyTimer.current = null;
    // Abort any in-flight model stream (text turn); harmless if idle.
    stopStream();
    setMockPending(false);
    setPendingMedia(null);
  }, [stopStream]);

  // Clear every pending timer + abort any live request when the provider unmounts
  // (navigation / sign-out), so no queued state update lands on a torn-down tree.
  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
      if (sendTimer.current) clearTimeout(sendTimer.current);
    },
    []
  );

  // --- Chat history (DB-backed drawer list) ---------------------------------
  // The raw newest-first rows from /api/history; `history` (below) buckets them by
  // recency. Empty for guests / when the DB is absent (route returns `[]`).
  const [rawHistory, setRawHistory] = useState<HistoryRow[]>([]);
  const history = useMemo(
    () => groupByRecency(rawHistory, chatId),
    [rawHistory, chatId]
  );

  // Fetch this user's threads. Plain (non-streaming) JSON GET, so RN's global fetch
  // is fine (expoFetch is only needed for the streaming chat body). Best-effort: a
  // failure leaves the current list untouched. Stable identity (reads userId via ref).
  const loadHistory = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) {
      setRawHistory([]);
      return;
    }
    try {
      const res = await fetch(
        generateAPIUrl(`/api/history?userId=${encodeURIComponent(userId)}`),
        { headers: { Accept: "application/json", ...authHeader(tokenRef.current) } }
      );
      const data = (await res.json()) as { chats?: HistoryRow[] };
      if (Array.isArray(data?.chats)) {
        setRawHistory(
          data.chats.map((c) => ({
            id: String(c.id),
            title: String(c.title || "New chat"),
            createdAt: String(c.createdAt ?? ""),
          }))
        );
      }
    } catch (e) {
      console.warn(
        "[history] load failed:",
        e instanceof Error ? e.message : String(e)
      );
    }
  }, []);

  // Refresh triggers: on mount + whenever the identity or persona changes; every time
  // the drawer opens (so the list is always current when seen); and after each turn
  // completes ('streaming'/'submitted' → 'ready'), which is when a new thread + title
  // persist. Guests have no saved history, so every trigger clears the list instead.
  useEffect(() => {
    if (guest) {
      setRawHistory([]);
      return;
    }
    loadHistory();
  }, [loadHistory, session?.address, guest]);
  useEffect(() => {
    if (drawerOpen && !guest) loadHistory();
  }, [drawerOpen, guest, loadHistory]);
  const prevStatus = useRef(status);
  useEffect(() => {
    if (!guest && prevStatus.current !== "ready" && status === "ready") {
      loadHistory();
    }
    prevStatus.current = status;
  }, [status, guest, loadHistory]);

  // Opening a past thread hydrates useChat with its saved messages. Because useChat is
  // keyed by `chatId`, changing the id first resets it to empty for the new thread;
  // the queued messages are then applied in the effect below, which runs AFTER the id
  // swap has committed — so the loaded messages land on the correct thread (setting
  // them inline would target the OLD id's message list).
  const pendingHydration = useRef<ChatMessage[] | null>(null);
  useEffect(() => {
    if (pendingHydration.current) {
      setChatMessages(pendingHydration.current);
      pendingHydration.current = null;
    }
  }, [chatId, setChatMessages]);

  const openChat = useCallback(
    async (id: string) => {
      cancelPending();
      setChatMenu(null);
      setDrawerOpen(false);
      setTabRaw("chat");
      if (id === chatId) return; // already the open thread
      const userId = userIdRef.current;
      try {
        const res = await fetch(
          generateAPIUrl(
            `/api/messages?chatId=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId ?? "")}`
          ),
          {
            headers: {
              Accept: "application/json",
              ...authHeader(tokenRef.current),
            },
          }
        );
        const data = (await res.json()) as { messages?: ChatMessage[] };
        pendingHydration.current = Array.isArray(data?.messages)
          ? data.messages
          : [];
        setChatId(id);
      } catch (e) {
        console.warn(
          "[history] open failed:",
          e instanceof Error ? e.message : String(e)
        );
      }
    },
    [cancelPending, chatId]
  );

  // Delete a thread. Optimistic: drop it from the list immediately (and start a fresh
  // chat if it was the open one), then hit the owner-checked DELETE route; on failure,
  // resync from the server so the row reappears rather than silently vanishing.
  const deleteChat = useCallback(
    async (id: string) => {
      setChatMenu(null);
      const userId = userIdRef.current;
      setRawHistory((prev) => prev.filter((c) => c.id !== id));
      if (id === chatId) {
        cancelPending();
        setChatMessages([]);
        setChatId(Crypto.randomUUID());
      }
      try {
        await fetch(
          generateAPIUrl(
            `/api/chat?chatId=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId ?? "")}`
          ),
          {
            method: "DELETE",
            headers: {
              Accept: "application/json",
              ...authHeader(tokenRef.current),
            },
          }
        );
      } catch (e) {
        console.warn(
          "[history] delete failed:",
          e instanceof Error ? e.message : String(e)
        );
        loadHistory();
      }
    },
    [cancelPending, chatId, setChatMessages, loadHistory]
  );

  const send = useCallback(
    (text?: string) => {
      // A turn is already in flight (streaming / awaiting / demo delay) — ignore
      // repeat submits (keyboard "send" stays active behind the Stop button, and
      // follow-up/suggestion taps) so we never fire a second request mid-stream.
      if (busy) return;
      const t = (typeof text === "string" ? text : draft).trim();
      if (!t) return;
      const { kind } = classify(t);
      setDraft("");
      setWorklogOpen(false);
      // Guest turns mirror web: proactively nudge sign-in on the 3rd guest turn.
      if (guest)
        setAnonTurns((prev) => {
          const next = prev + 1;
          if (next === 3) setNudge(true);
          return next;
        });

      if (kind === "text") {
        // Real streamed turn — appends the user message and streams the assistant
        // reply from the provider seam (Vercel AI Gateway). `useChat` owns the
        // message state + the 'submitted'/'streaming' status the UI reads.
        sendMessage({ text: t });
        return;
      }

      // Demo turn (wallet / image / video / artifact): inject the user message +
      // the canned assistant reply after the prototype's 1.6s delay — no model
      // call. These surfaces are real tool-call parts in web-v3.
      const isMedia = kind === "image" || kind === "video";
      const userMsg: ChatMessage = {
        id: uid("u"),
        role: "user",
        // Tag the demo turn's user side too, so the whole mock turn (user +
        // canned reply) is excluded from real model context (see transport filter).
        metadata: { demo: kind },
        parts: [{ type: "text", text: t }],
      };
      setChatMessages((prev) => [...prev, userMsg]);
      setMockPending(true);
      setPendingMedia(isMedia ? kind : null);

      if (replyTimer.current) clearTimeout(replyTimer.current);
      replyTimer.current = setTimeout(() => {
        setChatMessages((prev) => [...prev, buildDemoReply(kind)]);
        setMockPending(false);
        setPendingMedia(null);
      }, 1600);
    },
    [busy, draft, guest, sendMessage, setChatMessages]
  );

  // Onboarding transitions (prototype onboardNext / finish / skip — the mock
  // onGoogle sign-in animation was removed; the gate owns real sign-in).
  const finishOnboarding = useCallback(() => {
    cancelPending();
    setOnboarded(true);
    setGuest(false);
    setTabRaw("chat");
    setChatMessages([]);
    setChatId(Crypto.randomUUID());
    setStep(0);
    setAnonTurns(0);
  }, [cancelPending]);

  const replayOnboarding = useCallback(() => {
    cancelPending();
    setOnboarded(false);
    setGuest(false);
    setChatMessages([]);
    setChatId(Crypto.randomUUID());
    setStep(ONBOARD_START_STEP);
    setAnonTurns(0);
    setNudge(false);
    setCtxOpen(false);
  }, [cancelPending]);

  const stop = useCallback(() => {
    cancelPending();
  }, [cancelPending]);

  const newChat = useCallback(() => {
    cancelPending();
    setChatMessages([]);
    setChatId(Crypto.randomUUID());
    setDraft("");
    setDrawerOpen(false);
    setTabRaw("chat");
  }, [cancelPending, setChatMessages]);

  const setTab = useCallback((t: Tab) => {
    setTabRaw(t);
    setDrawerOpen(false);
    setSettingsView("home");
  }, []);

  const runSlash = useCallback(
    (name: string) => {
      if (name === "new") newChat();
      else if (name === "clear") {
        cancelPending();
        setChatMessages([]);
        setChatId(Crypto.randomUUID());
        setDraft("");
      } else if (name === "model") {
        setDraft("");
        setModelSheet(true);
        setModelQueryState("");
      } else if (name === "delete") {
        setDraft("");
        setConfirmKind("delete");
      } else if (name === "purge") {
        setDraft("");
        setConfirmKind("purge");
      } else setDraft("");
    },
    [newChat, cancelPending]
  );

  const confirmSend = useCallback(() => {
    if (amount > SPENDABLE_USDC) return;
    setStage("sending");
    if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => setStage("success"), 1400);
  }, [amount]);

  const doConfirm = useCallback(() => {
    setConfirmKind((k) => {
      if (k === "delete" || k === "purge") {
        cancelPending();
        setChatMessages([]);
        setChatId(Crypto.randomUUID());
        setDrawerOpen(false);
      }
      return null;
    });
  }, [cancelPending]);

  const value = useMemo<Store>(
    () => ({
      tab,
      setTab,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),

      messages,
      draft,
      setDraft,
      thinking,
      busy,
      pendingMedia,
      worklogOpen,
      toggleWorklog: () => setWorklogOpen((v) => !v),
      send,
      stop,
      newChat,
      askSuggestion: (t: string) => send(t),
      history,
      openChat,
      deleteChat,

      model,
      modelSheet,
      modelQuery,
      openModel: () => {
        setModelSheet(true);
        setModelQueryState("");
      },
      closeModel: () => setModelSheet(false),
      pickModel: (m: string) => {
        setModel(m);
        setModelSheet(false);
      },
      setModelQuery: setModelQueryState,

      visibility,
      visSheet,
      openVis: () => setVisSheet(true),
      closeVis: () => setVisSheet(false),
      setVisibility: (v: Visibility) => {
        setVisibilityState(v);
        setVisSheet(false);
      },

      attachDemo,
      toggleAttach: () => setAttachDemo((v) => !v),
      memoryOn,
      toggleMemory: () => setMemoryOn((v) => !v),
      ctxOpen,
      openCtx: () => setCtxOpen(true),
      closeCtx: () => setCtxOpen(false),
      runSlash,

      imageFull,
      imageDetails,
      openImageFull: () => {
        setImageFull(true);
        setImageDetails(false);
      },
      closeImageFull: () => setImageFull(false),
      toggleImageDetails: () => setImageDetails((v) => !v),
      artifactOpen,
      openArtifact: () => setArtifactOpen(true),
      closeArtifact: () => setArtifactOpen(false),

      walletView,
      setWallet: setWalletView,
      sendSheet,
      openSend: () => {
        if (sendTimer.current) clearTimeout(sendTimer.current);
        setSendSheet(true);
        setStage("confirm");
        setAmount(25);
        setRecipient("alice.audric");
      },
      closeSend: () => {
        if (sendTimer.current) clearTimeout(sendTimer.current);
        setSendSheet(false);
      },
      receiveSheet,
      openReceive: () => setReceiveSheet(true),
      closeReceive: () => setReceiveSheet(false),
      stage,
      amount,
      incAmount: () => setAmount((a) => Math.min(1000, a + 25)),
      decAmount: () => setAmount((a) => Math.max(25, a - 25)),
      recipient,
      toggleRecipient: () =>
        setRecipient((r) => (r === "alice.audric" ? "0x9a3f…c1d2" : "alice.audric")),
      confirmSend,

      settingsView,
      setSettings: setSettingsView,
      goBilling: () => setSettingsView("billing"),
      goSettingsHome: () => setSettingsView("home"),
      plansSheet,
      openPlans: () => setPlansSheet(true),
      closePlans: () => setPlansSheet(false),
      billAsset,
      setBillAsset: setBillAssetState,
      autoRecharge,
      toggleAutoRecharge: () => setAutoRecharge((v) => !v),
      termsInfoOpen,
      toggleTermsInfo: () => setTermsInfoOpen((v) => !v),

      referralSheet,
      openReferral: () => setReferralSheet(true),
      closeReferral: () => setReferralSheet(false),
      customSheet,
      customText,
      openCustom: () => setCustomSheet(true),
      closeCustom: () => setCustomSheet(false),
      onCustomText: (v: string) => setCustomText(v.slice(0, 2000)),
      handleSheet,
      handleText,
      openHandle: () => {
        setHandleSheet(true);
        setHandleText("");
      },
      closeHandle: () => setHandleSheet(false),
      onHandleText: (v: string) =>
        setHandleText((v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20)),
      accountMenu,
      openAccount: () => setAccountMenu(true),
      closeAccount: () => setAccountMenu(false),
      chatMenu,
      openChatMenu: (id: string) => setChatMenu(id),
      closeChatMenu: () => setChatMenu(null),
      confirmKind,
      askConfirm: (k: ConfirmKind) => setConfirmKind(k),
      closeConfirm: () => setConfirmKind(null),
      doConfirm,

      onboarded,
      step,
      onboardNext: () => setStep((s) => Math.min(3, s + 1)),
      finishOnboarding,
      replayOnboarding,

      guest,
      anonTurns,
      nudge,
      openNudge: () => setNudge(true),
      closeNudge: () => setNudge(false),
    }),
    [
      tab,
      setTab,
      drawerOpen,
      messages,
      draft,
      thinking,
      busy,
      pendingMedia,
      worklogOpen,
      send,
      stop,
      newChat,
      history,
      openChat,
      deleteChat,
      model,
      modelSheet,
      modelQuery,
      visibility,
      visSheet,
      attachDemo,
      memoryOn,
      ctxOpen,
      runSlash,
      imageFull,
      imageDetails,
      artifactOpen,
      walletView,
      sendSheet,
      receiveSheet,
      stage,
      amount,
      recipient,
      confirmSend,
      settingsView,
      plansSheet,
      billAsset,
      autoRecharge,
      termsInfoOpen,
      referralSheet,
      customSheet,
      customText,
      handleSheet,
      handleText,
      accountMenu,
      chatMenu,
      confirmKind,
      doConfirm,
      onboarded,
      step,
      finishOnboarding,
      replayOnboarding,
      guest,
      anonTurns,
      nudge,
    ]
  );

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}

export function useAppState(): Store {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within <AppStateProvider>");
  return ctx;
}
