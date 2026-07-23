import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import * as Crypto from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
import { Alert } from "react-native";
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
  IMAGE_MODELS,
  modelId,
} from "@/app-state/catalog";
import {
  MAX_ATTACHMENTS,
  type PendingAttachment,
  pickAttachment,
  toFileParts,
} from "@/lib/attachments";
import { authHeader } from "@/auth/session";
import { useAuth } from "@/auth/useAuth";
import { generateAPIUrl } from "@/lib/api-url";
import {
  DEFAULT_CHAT_MODEL,
  loadChatModel,
  loadCustomInstructions,
  loadOnboarded,
  saveChatModel,
  saveCustomInstructions,
  saveOnboarded,
} from "@/lib/prefs";
import type { ChatMessage } from "@/lib/types";
import { resolveRecipient } from "@/lib/wallet/recipient";
import { sendSui } from "@/lib/wallet/send";
import { useTheme } from "@/theme/theme";

// A faithful port of the mobile prototype's single `Component` state machine
// (`Audric Mobile Design Brief/Audric Mobile.dc.html`). The prototype runs the
// whole app from one component: a `tab` swaps the content area in place, a drawer
// slides over it, and every other surface is a sheet toggled by a boolean. This
// store holds that exact state + the same action methods so the RN shell, views,
// and sheets stay a 1:1 mapping of the design. It is demo/mock behaviour (the
// same the prototype ships); the real web-v3 SSE transport + wallet calls swap in
// behind these actions later without changing the UI.

export type Tab = "chat" | "wallet" | "settings";
export type Visibility = "private" | "public";
export type SendStage = "confirm" | "sending" | "success" | "error";
export type ConfirmKind = "delete" | "purge" | "forget" | "signout" | null;

// The chat message model is now the Vercel AI SDK `ChatMessage` (role + parts[],
// see `@/lib/types`) — the same wire shape as web-v3. EVERY turn streams real
// parts from the model.
// `metadata.demo` (image/video/artifact cards) has NO producer any more: the
// client-side classifier that minted those canned turns is gone (see `send` below).
// The render branches + card components in `components/chat/conversation.tsx` and
// the two sheets they open are therefore currently unreachable — kept, not wired,
// until real image/artifact tools land (which will render from `parts`, not
// metadata). Nothing may reintroduce a locally-authored assistant turn.

// Onboarding entry (see AGENTS/CLAUDE Phase-0). The real zkLogin `gate` is the
// production sign-in, so once a user reaches the app they are ALREADY signed in —
// showing the prototype's mock "Continue with Google" Welcome step again would be
// a second, FAKE sign-in. Onboarding therefore always starts at step 1
// (Privacy → Wallet → FaceID).
//
// This was `__DEV__ ? 0 : 1`, so dev builds could preview step 0 behind the gate's
// dev bypass. That bypass is gone, so the branch only meant dev users reached the
// app for real and were then shown a mock Google button. Removed with it.

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
  /** A turn is in flight (awaiting OR streaming) — drives the Stop button. */
  busy: boolean;
  worklogOpen: boolean;
  toggleWorklog: () => void;
  send: (text?: string) => void;
  stop: () => void;
  newChat: () => void;
  askSuggestion: (t: string) => void;

  // composer attachments (real OS picker → data-URL `file` parts: images inline,
  // PDFs extracted to text server-side). Sent with the next turn, then cleared.
  // `canAttach` gates the paperclip on the model.
  attachments: PendingAttachment[];
  canAttach: boolean;
  pickAttachment: () => void;
  removeAttachment: (id: string) => void;

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
  recipientInput: string;
  setRecipientInput: (v: string) => void;
  resolvedTo: string | null;
  amount: number;
  amountText: string;
  setAmountText: (t: string) => void;
  digest: string | null;
  sendError: string | null;
  confirmSend: () => Promise<void>;
  retrySend: () => void;

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
  /** Persist the custom instructions to the device, then close the sheet. */
  saveCustom: () => void;
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
  /** false until the persisted onboarded flag has been read (gates the shell). */
  onboardReady: boolean;
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

// NOTE: there is deliberately NO client-side classifier here any more. The prototype
// used to route a message whose text matched an image/video/artifact keyword regex
// ("write", "code", "table", "report", "generate", …) into a canned demo card — the
// model was never called, so a real question silently got mock output. Wallet/balance
// wording had the same treatment and asserted a fabricated figure. Every message now
// goes to `/api/chat` and is answered by the model, which has the real `balance_check`
// tool bound to the signed-in address. Never reintroduce a client-side branch that
// answers a user's message locally.

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

// Abort-safe wrapper around `expo/fetch`. expo/fetch streams the SSE body (RN's
// global fetch can't), but its response-body ReadableStream is closed ONLY by the
// native `didComplete`/`didFailWithError` events. Aborting the request instead
// calls native `request.cancel()`, which does NOT close or error the JS-side
// stream controller — so the AI SDK read loop never receives a clean `{done}` and
// spins the JS thread (tap Stop mid-stream → hard freeze; the D1 defect).
//
// The fix owns the stream: pump the source body into a ReadableStream WE control,
// and on the request's abort signal cancel the source AND `controller.close()` our
// stream, so the AI SDK reader settles immediately (a clean end finalizes the
// partial turn). Only the streamed success body is wrapped — error responses are
// read via `.text()`/`.json()`, so their body reader is left untouched.
const streamingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const baseFetch = expoFetch as unknown as typeof globalThis.fetch;
  const res = await baseFetch(input as Parameters<typeof globalThis.fetch>[0], init);
  const signal = init?.signal ?? undefined;
  if (!res.ok || !res.body) return res;

  const reader = res.body.getReader();
  let closed = false;
  const wrapped = new ReadableStream<Uint8Array>({
    start(controller) {
      const onAbort = () => {
        if (closed) return;
        closed = true;
        void reader.cancel().catch(() => {});
        try {
          controller.close();
        } catch {
          // controller already closed — nothing to do.
        }
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort);
      }
      const pump = () => {
        reader.read().then(
          ({ done, value }) => {
            if (closed) return;
            if (done) {
              closed = true;
              controller.close();
              return;
            }
            controller.enqueue(value);
            pump();
          },
          (err) => {
            if (closed) return;
            closed = true;
            controller.error(err);
          }
        );
      };
      pump();
    },
    cancel() {
      closed = true;
      void reader.cancel().catch(() => {});
    },
  });

  // Delegate everything to the real response, but hand out the abort-safe body.
  // `Reflect.get` binds the receiver to the source so getters (headers/status)
  // don't recurse through this proxy.
  return new Proxy(res, {
    get(target, prop) {
      if (prop === "body") return wrapped;
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}) as unknown as typeof globalThis.fetch;

export function AppStateProvider({ children }: { children: ReactNode }) {
  // `/theme` dispatches the real theme toggle. ThemeProvider wraps this provider
  // (app/_layout.tsx → RootNavigator → app/(app)/_layout.tsx), so this is safe.
  const { toggle: toggleTheme } = useTheme();
  const [tab, setTabRaw] = useState<Tab>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [draft, setDraft] = useState("");
  const [worklogOpen, setWorklogOpen] = useState(false);

  // Images picked in the composer but not yet sent. Read at send-time via a ref so
  // the send/pick callbacks stay stable (they don't re-create the transport).
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Model pick persists across a Metro reload / cold start (web-v3 keeps the same
  // choice in its `chat-model` cookie). Without this the picker silently snapped
  // back to Auto on every reload and the user's next turn ran on another model.
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [modelSheet, setModelSheet] = useState(false);
  const [modelQuery, setModelQueryState] = useState("");

  const [visibility, setVisibilityState] = useState<Visibility>("private");
  const [visSheet, setVisSheet] = useState(false);

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
  const [recipientInput, setRecipientInput] = useState("");
  const [resolvedTo, setResolvedTo] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const amount = Number(amountText) || 0;
  const [digest, setDigest] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [settingsView, setSettingsView] = useState<"home" | "billing">("home");
  const [plansSheet, setPlansSheet] = useState(false);
  const [billAsset, setBillAssetState] = useState<"USDC" | "SUI">("USDC");
  const [autoRecharge, setAutoRecharge] = useState(false);
  const [termsInfoOpen, setTermsInfoOpen] = useState(false);

  const [referralSheet, setReferralSheet] = useState(false);
  const [customSheet, setCustomSheet] = useState(false);
  const [customText, setCustomText] = useState("");
  // Custom instructions persist across restarts and are actually APPLIED to every
  // turn (forwarded in the request body → prepended to the system prompt). Before
  // this they were session-only local state behind a "Save" button that saved
  // nothing — see AUDIT-2026-07-20.md #5.
  const customTextRef = useRef(customText);
  useEffect(() => {
    customTextRef.current = customText;
  }, [customText]);
  useEffect(() => {
    loadCustomInstructions().then(setCustomText);
    loadChatModel().then(setModel);
  }, []);
  const [handleSheet, setHandleSheet] = useState(false);
  const [handleText, setHandleText] = useState("");
  const [accountMenu, setAccountMenu] = useState(false);
  const [chatMenu, setChatMenu] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);

  // Onboarding — the app boots into the first-launch flow (prototype default
  // `onboarded:false`). Real sign-in already happened at the gate; the steps
  // only introduce the app ("Get started" advances, "Skip for now" finishes).
  const [onboarded, setOnboarded] = useState(false);
  // Gate the shell until the persisted flag is read, so a returning user never
  // sees a frame of onboarding before it snaps to chat. Load once on mount.
  const [onboardReady, setOnboardReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadOnboarded().then((done) => {
      if (!alive) return;
      if (done) setOnboarded(true);
      setOnboardReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  const [step, setStep] = useState(1);
  // Guest persona (anonymous "try before signup"): free models, no persistence,
  // a sign-in nudge after a few turns. Flipped by the onboarding actions.
  const [guest, setGuest] = useState(false);
  const [anonTurns, setAnonTurns] = useState(0);
  const [nudge, setNudge] = useState(false);

  const inFlightRef = useRef(false);
  // Bumped on every openSend/closeSend. A confirmSend snapshots it and gates its
  // state writes, so a send whose sheet was dismissed + reopened mid-flight can't
  // clobber the fresh session's stage/digest/error when it finally settles.
  const sendGenRef = useRef(0);

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
  // request time (same ref pattern as the model/userId). Absent on an untokened
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
        // Abort-safe wrapper (not raw expoFetch) so tapping Stop mid-stream cleanly
        // terminates the read loop instead of spinning the JS thread — see D1.
        fetch: streamingFetch,
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
            // Standing user directions — the sheet promises Audric "follows [them]
            // in every reply", so they must actually reach the system prompt.
            customInstructions: customTextRef.current || undefined,
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
      // Streaming failed (network / provider) — the partial assistant message (if
      // any) stays so the user sees what arrived. Prod surfaces a toast here.
      console.warn("[chat] stream error:", err?.message ?? String(err));
    },
  });

  // Thinking dots show only BEFORE the first token ('submitted'); once tokens
  // stream in, the assistant bubble renders them.
  const thinking = status === "submitted";
  // Busy = a turn is in flight → composer shows Stop, context ring hides.
  const busy = status === "submitted" || status === "streaming";

  // Cancel the in-flight model request so a late-arriving response can't repopulate
  // a thread that was just cleared (clear / delete / purge / new chat / onboarding
  // reset). Harmless if idle.
  const cancelPending = useCallback(() => {
    stopStream();
  }, [stopStream]);

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
      setAttachments([]);
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
        // fetch() only rejects on network errors — a 401/500 resolves normally, so
        // gate on res.ok to route HTTP failures into the resync below.
        const res = await fetch(
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      const atts = attachmentsRef.current;
      // Nothing to send. An image with no caption is a valid turn ("what is this?"
      // works on its own), so text OR an attachment is enough.
      if (!t && atts.length === 0) return;
      setDraft("");
      setWorklogOpen(false);
      if (atts.length) setAttachments([]);
      // Guest turns mirror web: proactively nudge sign-in on the 3rd guest turn.
      if (guest)
        setAnonTurns((prev) => {
          const next = prev + 1;
          if (next === 3) setNudge(true);
          return next;
        });

      // Real streamed turn — appends the user message and streams the assistant
      // reply from the provider seam (Vercel AI Gateway). `useChat` owns the
      // message state + the 'submitted'/'streaming' status the UI reads. EVERY
      // message takes this path; there is no local answer. Attachments ride along as
      // `file` parts (data URLs) — images the model reads directly, PDFs the BFF
      // extracts to text; a caption-less send omits the empty text part.
      if (atts.length) {
        const files = toFileParts(atts);
        sendMessage(t ? { text: t, files } : { files });
      } else {
        sendMessage({ text: t });
      }
    },
    [busy, draft, guest, sendMessage]
  );

  // Open the attach chooser (Photo Library / Files) and stage the picks. Every
  // current model reads images (Kimi/Auto included — verified via the Gateway; see
  // `IMAGE_MODELS`) and PDFs work on any model (extracted to text server-side), so
  // this guard is dormant forward-safety: it only fires if a future text-only model
  // is added. Reads model + current count via refs to stay stable. Picker errors are
  // surfaced by the chooser, never swallowed silently.
  const pickAttachmentCb = useCallback(async () => {
    if (!IMAGE_MODELS.has(modelRef.current)) {
      Alert.alert(
        "Switch to a vision model",
        "This model can't read attachments. Pick another model from the menu."
      );
      return;
    }
    const remaining = MAX_ATTACHMENTS - attachmentsRef.current.length;
    if (remaining <= 0) {
      Alert.alert(
        "Attachment limit",
        `You can attach up to ${MAX_ATTACHMENTS} files per message.`
      );
      return;
    }
    try {
      const picked = await pickAttachment(remaining);
      if (picked.length) {
        setAttachments((prev) => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
      }
    } catch (e) {
      console.warn(
        "[attach] pick failed:",
        e instanceof Error ? e.message : String(e)
      );
      Alert.alert("Something went wrong");
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Onboarding transitions (prototype onboardNext / finish / skip — the mock
  // onGoogle sign-in animation was removed; the gate owns real sign-in).
  const finishOnboarding = useCallback(() => {
    cancelPending();
    setOnboarded(true);
    void saveOnboarded(true);
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
    void saveOnboarded(false);
    setGuest(false);
    setChatMessages([]);
    setChatId(Crypto.randomUUID());
    setStep(1);
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
    setAttachments([]);
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
        setAttachments([]);
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
      } else if (name === "theme") {
        setDraft("");
        toggleTheme();
      } else setDraft("");
    },
    [newChat, cancelPending, toggleTheme]
  );

  const changeRecipient = useCallback((v: string) => {
    setRecipientInput(v);
    // Editing the recipient invalidates any prior resolution — otherwise Retry
    // would skip re-resolution and silently send to the previously resolved address.
    setResolvedTo(null);
  }, []);

  const changeAmount = useCallback((t: string) => {
    // Keep only digits and a single decimal point so fractional SUI stays typable;
    // a naive Number()-roundtrip on the raw text would strip a trailing "." mid-entry.
    const cleaned = t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    setAmountText(cleaned);
  }, []);

  const confirmSend = useCallback(async () => {
    // Double-tap defense (web-v3 parity: the confirm button is disabled while a
    // send is in flight). The in-flight ref drops a second tap before it can
    // reach sendSui — the executor also reserves its dedup lock before broadcast,
    // but this ref stops a second tap from ever getting that far.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const gen = sendGenRef.current;
    setSendError(null);
    let to = resolvedTo;
    try {
      if (!to) {
        const r = await resolveRecipient(recipientInput);
        to = r.address;
        if (sendGenRef.current === gen) setResolvedTo(r.address);
      }
      // The recipient resolve above is async, so the session could have been
      // dismissed/reopened while it ran. Gate the broadcast itself (not just the UI
      // writes): if this is no longer the live send session, abort BEFORE signing or
      // broadcasting — never move money for a torn-down session.
      if (sendGenRef.current !== gen) {
        return;
      }
      setStage("sending");
      // Pass the raw text (exact base-unit parse happens in sendSui — no pre-rounded
      // float) and the authenticated address (sendSui rejects a stale wrong-account key
      // set). `?? ""` → empty never matches on-device keys, so it fails closed.
      const { digest: d } = await sendSui({
        to,
        amount: amountText,
        expectedAddress: session?.address ?? "",
      });
      if (sendGenRef.current === gen) {
        setDigest(d);
        setStage("success");
      }
    } catch (e) {
      // The dedup lock is owned entirely by the executor (sendSui) — the store must
      // NEVER touch it. Clearing it here would re-enable a second broadcast after an
      // ambiguous post-broadcast failure. Only the UI writes are generation-gated.
      if (sendGenRef.current === gen) {
        setSendError(e instanceof Error ? e.message : "Send failed.");
        setStage("error");
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [recipientInput, resolvedTo, amountText, session?.address]);

  const retrySend = useCallback(() => {
    setSendError(null);
    setStage("confirm");
  }, []);

  // Shared optimistic reset for the two chat-wiping actions (delete-all / purge):
  // clear the drawer list + the open thread immediately, so the UI reflects the
  // wipe before the network round-trip. `loadHistory()` resyncs on failure so rows
  // reappear rather than silently vanishing — same pattern as `deleteChat`.
  const resetAfterWipe = useCallback(() => {
    setRawHistory([]);
    cancelPending();
    setChatMessages([]);
    setChatId(Crypto.randomUUID());
    setAttachments([]);
    setDrawerOpen(false);
  }, [cancelPending, setChatMessages]);

  // "Delete all chats" — authed `DELETE /api/history` (owner-checked server-side).
  const deleteAllChats = useCallback(async () => {
    const userId = userIdRef.current;
    resetAfterWipe();
    try {
      // fetch() only rejects on network errors — a 401/500 resolves normally. Without
      // the res.ok gate a rejected wipe would leave the UI cleared while the server
      // still holds every chat: a false "deleted" state on the privacy hub. Treat a
      // non-OK response as a failure so the catch restores the list and tells the user.
      const res = await fetch(
        generateAPIUrl(
          `/api/history?userId=${encodeURIComponent(userId ?? "")}`
        ),
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            ...authHeader(tokenRef.current),
          },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn(
        "[account] delete-all failed:",
        e instanceof Error ? e.message : String(e)
      );
      loadHistory();
      Alert.alert(
        "Couldn't delete chats",
        "Something went wrong — your chats were not deleted."
      );
    }
  }, [resetAfterWipe, loadHistory]);

  // "Purge all my data" — authed `POST /api/account/purge` (chats + messages +
  // artifact documents). Same optimistic local wipe as delete-all.
  const purgeAllData = useCallback(async () => {
    const userId = userIdRef.current;
    resetAfterWipe();
    try {
      const res = await fetch(generateAPIUrl("/api/account/purge"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeader(tokenRef.current),
        },
        body: JSON.stringify({ userId }),
      });
      // See deleteAllChats: gate on res.ok so an HTTP-level rejection restores the
      // list instead of leaving a false "purged" state while the data still exists.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn(
        "[account] purge failed:",
        e instanceof Error ? e.message : String(e)
      );
      loadHistory();
      Alert.alert(
        "Couldn't purge your data",
        "Something went wrong — your data was not deleted."
      );
    }
  }, [resetAfterWipe, loadHistory]);

  // "Forget all my memories" — authed `POST /api/account/forget-memory` bumps the
  // server memory epoch (recall/save move to a fresh namespace). Nothing local to
  // clear: chats + the memory toggle are unaffected, only future recall changes.
  const forgetMemory = useCallback(async () => {
    const userId = userIdRef.current;
    try {
      const res = await fetch(generateAPIUrl("/api/account/forget-memory"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeader(tokenRef.current),
        },
        body: JSON.stringify({ userId }),
      });
      // Nothing local to restore, so a silent HTTP failure is the worst case: the
      // dialog closes as if memories were forgotten while the epoch never moved.
      // Gate on res.ok and surface the failure so the claim isn't a false assurance.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn(
        "[account] forget-memory failed:",
        e instanceof Error ? e.message : String(e)
      );
      Alert.alert(
        "Couldn't forget memories",
        "Something went wrong — your memories were not cleared."
      );
    }
  }, []);

  // Confirm the pending destructive action. Read `confirmKind` directly (not via a
  // state-updater) so the side-effect fires exactly once — a side-effect inside a
  // setState updater double-fires under React StrictMode, which would double-POST.
  const doConfirm = useCallback(() => {
    const k = confirmKind;
    setConfirmKind(null);
    if (k === "delete") void deleteAllChats();
    else if (k === "purge") void purgeAllData();
    else if (k === "forget") void forgetMemory();
  }, [confirmKind, deleteAllChats, purgeAllData, forgetMemory]);

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
      worklogOpen,
      toggleWorklog: () => setWorklogOpen((v) => !v),
      send,
      stop,
      newChat,
      askSuggestion: (t: string) => send(t),
      attachments,
      canAttach: IMAGE_MODELS.has(model),
      pickAttachment: pickAttachmentCb,
      removeAttachment,
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
        // Best-effort persist; a write failure only costs the pick on next launch.
        saveChatModel(m);
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
        sendGenRef.current += 1;
        setSendSheet(true);
        setStage("confirm");
        setRecipientInput("");
        setResolvedTo(null);
        setAmountText("");
        setDigest(null);
        setSendError(null);
      },
      closeSend: () => {
        sendGenRef.current += 1;
        setSendSheet(false);
      },
      receiveSheet,
      openReceive: () => setReceiveSheet(true),
      closeReceive: () => setReceiveSheet(false),
      stage,
      recipientInput,
      setRecipientInput: changeRecipient,
      resolvedTo,
      amount,
      amountText,
      setAmountText: changeAmount,
      digest,
      sendError,
      confirmSend,
      retrySend,

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
      saveCustom: () => {
        // Persist, then close. Fire-and-forget: the write is best-effort inside
        // `saveCustomInstructions`, and the in-memory value already applies to the
        // next turn either way.
        saveCustomInstructions(customTextRef.current);
        setCustomSheet(false);
      },
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
      onboardReady,
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
      worklogOpen,
      send,
      stop,
      newChat,
      attachments,
      pickAttachmentCb,
      removeAttachment,
      history,
      openChat,
      deleteChat,
      model,
      modelSheet,
      modelQuery,
      visibility,
      visSheet,
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
      recipientInput,
      resolvedTo,
      amount,
      amountText,
      changeRecipient,
      changeAmount,
      digest,
      sendError,
      confirmSend,
      retrySend,
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
      onboardReady,
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
