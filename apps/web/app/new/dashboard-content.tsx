'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { ChipBar } from '@/components/dashboard/ChipBar';
import { ChipExpand } from '@/components/dashboard/ChipExpand';
import { SaveDrawer } from '@/components/dashboard/SaveDrawer';
import { InputBar } from '@/components/dashboard/InputBar';
import { useChipExpand } from '@/hooks/useChipExpand';
import { ConfirmationCard } from '@/components/dashboard/ConfirmationCard';
import { ResultCard } from '@/components/dashboard/ResultCard';
import { AmountChips } from '@/components/dashboard/AmountChips';
import { SwapAssetPicker, type SwapAsset } from '@/components/dashboard/SwapAssetPicker';
import { resolveFlow } from '@/components/dashboard/AgentMarkdown';
import { UnifiedTimeline } from '@/components/dashboard/UnifiedTimeline';
import { getPresetConfig } from '@/lib/engine/permission-tiers-client';
import { AppShell } from '@/components/shell/AppShell';
import { useChipFlow, type ChipFlowResult, type FlowContext } from '@/hooks/useChipFlow';
import { useFeed } from '@/hooks/useFeed';
import { useEngine, executeToolAction, executeBundleAction } from '@/hooks/useEngine';
import type { PendingAction } from '@/lib/engine-types';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { useVoiceStatus } from '@/hooks/useVoiceStatus';
import { useEngineReplyAwaiter } from '@/hooks/useEngineReplyAwaiter';
import { VoiceModeProvider } from '@/components/dashboard/VoiceModeContext';
import { useBalance } from '@/hooks/useBalance';
import { useReceiveToast } from '@/hooks/useReceiveToast';
import { parseIntent, type ParsedIntent } from '@/lib/intent-parser';
import { mapError } from '@/lib/errors';
import { SUI_NETWORK } from '@/lib/constants';
import { useContacts } from '@/hooks/useContacts';
import { useAgent } from '@/hooks/useAgent';
import { COIN_REGISTRY } from '@/lib/token-registry';
import { buildSwapDisplayData } from '@/lib/balance-changes';
import { buildSuiPayUri } from '@/lib/sui-pay-uri';
import { looksLikeSuiNs, resolveSuiNs, SuinsResolutionError } from '@/lib/suins-resolver';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { NewConversationView } from '@/components/dashboard/NewConversationView';
import { TosBanner } from '@/components/dashboard/TosBanner';
import { UsernameClaimGate } from '@/components/identity/UsernameClaimGate';
import { Spinner } from '@/components/ui/Spinner';
import { useUserStatus } from '@/hooks/useUserStatus';
import { usePanel } from '@/hooks/usePanel';
import { decodeJwtClaim } from '@/lib/jwt-client';
import { PortfolioPanel } from '@/components/panels/PortfolioPanel';
import { ActivityPanel } from '@/components/panels/ActivityPanel';
import { PayPanel } from '@/components/panels/PayPanel';
import { GoalsPanel } from '@/components/panels/GoalsPanel';
import { ContactsPanel } from '@/components/panels/ContactsPanel';
import { StorePanel } from '@/components/panels/StorePanel';
// [SIMPLIFICATION DAY 11] Final chat-first dashboard pass (Option A).
// Removed in this pass:
//   - ContextualChips + deriveContextualChips + dismissedCards state
//     (banner-style hint chips above the input — spec: "no banners, no canvas chips")
//   - useOvernightEarnings + LS_LAST_OPEN/LS_LAST_SAVINGS + dailyReportShown
//     (proactive morning-report feed item — spec: "no proactive notifications")
//   - automations + reports panel cases (sidebar entries removed; PanelId narrowed)
//   - allowance* AppShell props (already noted as soft no-op since S.4)
// Earlier S.5/S.6 already removed: BriefingCard, FirstLoginView, GracePeriodBanner,
// ProactiveBanner, HandledForYou, CopilotSuggestionsRow, CopilotOnboardingModal,
// EmailAddNudge, TaskCard, MilestoneCard, useOvernightBriefing,
// useDashboardInsights, useScheduledActions, AutomationsPanel, ReportsPanel.
// What's left above the fold: balance header, greeting (empty only),
// chip bar, chat input — and an inline HF widget when debt AND HF<2.0.

// [SPEC 10 B-wiring] Skip-flag helpers extracted to `lib/identity/username-skip.ts`
// in S.84 polish v4 — Settings → Passport (the safety valve per D2) needs
// to clear the same flag after a re-claim, and an inline storage key
// here would have drifted from the Settings consumer. See the module
// header for the per-address rationale.
import {
  isUsernameSkipped,
  setUsernameSkipped as persistUsernameSkipped,
} from '@/lib/identity/username-skip';
import { isContactPromptSkipped } from '@/lib/identity/contact-prompt-skip';

// [S.84] Greeting now sources from the Audric handle, not the zkLogin
// email-derived prefix. Pre-claim users see "Good morning" with no name
// (rather than e.g. "Good morning, funkiirabu" leaking the email-local
// part). Post-claim users see "Good morning, alice" — their chosen
// identity, not their inbox. Aligns the composer header with D10's
// "the handle is the user's identity" framing.
function getGreeting(username: string | null | undefined): string {
  const hour = new Date().getHours();
  const nameStr = username ? `, ${username}` : '';
  if (hour < 12) return `Good morning${nameStr}`;
  if (hour < 18) return `Good afternoon${nameStr}`;
  return `Good evening${nameStr}`;
}

function fmtDollar(n: number): string {
  if (n >= 1) return `${Math.floor(n)}`;
  if (n > 0) return n.toFixed(2);
  return '0';
}

function capForFlow(
  flow: string,
  bal: { cash: number; savings: number; borrows: number; maxBorrow: number; sui: number; usdc: number; assetBalances: Record<string, number> },
): number {
  switch (flow) {
    case 'save': return bal.usdc;
    case 'send': return bal.cash;
    case 'withdraw': return bal.savings;
    case 'repay': return bal.borrows;
    case 'borrow': return bal.maxBorrow;
    default: return bal.cash;
  }
}

function getAmountPresets(flow: string, bal: { cash: number; savings: number; borrows: number; maxBorrow: number; sui: number; usdc: number; assetBalances: Record<string, number> }): number[] {
  const rawCap = capForFlow(flow, bal);
  if (rawCap <= 0) return [];

  const cap = Math.floor(rawCap);
  if (cap <= 0) return [];
  if (cap <= 5) return [1, 2, Math.min(5, cap)].filter((v, i, a) => v <= cap && a.indexOf(v) === i);
  if (cap <= 20) return [1, 5, 10].filter((v) => v <= cap);
  if (cap <= 100) return [5, 10, 25].filter((v) => v <= cap);
  if (cap <= 500) return [25, 50, 100].filter((v) => v <= cap);
  return [50, 100, 200];
}

/**
 * [SPEC 10 Phase C.3] Result row from /api/identity/search. Mirrors the
 * server's response shape; kept inline (rather than imported from a shared
 * types module) because the SendRecipientInput is the only consumer right
 * now and inlining keeps the dashboard-content surface honest.
 */
interface AudricUserSearchResult {
  username: string;
  fullHandle: string;
  address: string;
  claimedAt: string;
}

function SendRecipientInput({
  contacts,
  onSelectContact,
  onSelectAudricUser,
  onSubmit,
  isKnownAddress,
  onSaveAudricUser,
  onCancel,
}: {
  contacts: Array<{ name: string; address: string }>;
  onSelectContact: (address: string, name: string) => void;
  /**
   * [SPEC 10 Phase C.3 — bug fix] Dedicated handler for dropdown picks.
   * Receives BOTH the resolved 0x address (from the search response)
   * AND the full handle (for display). Without this, the original C.3
   * implementation passed the bare handle as the recipient → the chip
   * flow forwarded it to /api/transactions/prepare → 400 "Invalid
   * recipient address" because the prepare route validates strict 0x.
   */
  onSelectAudricUser: (address: string, fullHandle: string) => void;
  onSubmit: (input: string) => void;
  /**
   * [SPEC 10 D.5] Inline-save support. `isKnownAddress` filters the
   * `+` affordance off rows the user already has saved.
   * `onSaveAudricUser` persists with the bare username as the default
   * nickname (sensible default — the user can rename later in
   * /settings/contacts). Returns a promise so the button can render
   * a transient "Saving…" state.
   */
  isKnownAddress: (addr: string) => boolean;
  onSaveAudricUser: (address: string, name: string) => Promise<void>;
  /**
   * [B1 polish F2] Cancel the entire send flow (parent wires this to
   * `chipFlow.reset`). Without this, the recipient picker had no
   * visible "back out" affordance — the user had to either click
   * elsewhere in the dashboard or press Esc (which only cleared the
   * search dropdown, not the chip flow). F1's global Esc handler now
   * also routes here.
   */
  onCancel?: () => void;
}) {
  const [value, setValue] = useState('');
  const [searchResults, setSearchResults] = useState<AudricUserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // [SPEC 10 D.5] Per-row save state: tracks which dropdown-row save is
  // currently in flight (or just succeeded) so we can render
  // "Saving…" / "Saved ✓" without flipping the row out from under the
  // user's tap target.
  const [savingAddr, setSavingAddr] = useState<string | null>(null);
  const [savedAddrs, setSavedAddrs] = useState<Set<string>>(() => new Set());

  // [SPEC 10 Phase C.3] Detect the `@`-prefix typing pattern. The user's
  // raw `@alice` input is the chip-flow shortcut for "find an Audric
  // user". Per D10 (LOCKED), the `@` form is INPUT-ONLY — the moment
  // the user picks a result the input value flips to the full
  // `alice.audric.sui` handle. Bare `@` (length 0 query) hides the
  // dropdown — start showing it once they type at least 1 char.
  const isAtPrefix = value.startsWith('@');
  const atQuery = isAtPrefix ? value.slice(1).trim().toLowerCase() : '';
  const showDropdown = isAtPrefix && atQuery.length > 0;

  // Debounced fetch: 200ms after the user stops typing. Fast enough to
  // feel responsive, slow enough that typing "@al" → "@ali" → "@alic"
  // → "@alice" doesn't fire 4 round-trips. Uses AbortController so a
  // stale response can't race a fresh one (typing fast → out-of-order
  // resolves).
  useEffect(() => {
    if (!showDropdown) {
      setSearchResults([]);
      setIsSearching(false);
      abortRef.current?.abort();
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/identity/search?q=${encodeURIComponent(atQuery)}&limit=10`,
          { signal: ctrl.signal },
        );
        if (!res.ok) {
          setSearchResults([]);
          setIsSearching(false);
          return;
        }
        const body = (await res.json()) as { results?: AudricUserSearchResult[] };
        if (ctrl.signal.aborted) return;
        setSearchResults(body.results ?? []);
      } catch {
        // Network error / abort — silent. The dropdown stays empty;
        // user can still paste a 0x address into the input.
      } finally {
        if (!ctrl.signal.aborted) setIsSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [showDropdown, atQuery]);

  const handleSubmit = () => {
    const input = value.trim();
    if (!input) return;
    // [SPEC 10 Phase C.3] If user submits while still on the `@query`
    // form WITHOUT picking a result (e.g. presses Enter early), reject
    // the bare `@` shortcut — they should pick a result so the engine
    // gets the full handle. If they really meant to send to a literal
    // string starting with `@`, they can prefix differently. This is
    // load-bearing for D10 — the engine should never see `@alice`.
    if (input.startsWith('@')) return;
    onSubmit(input);
  };

  const handlePickResult = (r: AudricUserSearchResult) => {
    setValue(r.fullHandle);
    setSearchResults([]);
    // [SPEC 10 Phase C.3 — bug fix] Route through onSelectAudricUser so
    // the chip flow's `recipient` is the resolved 0x address, not the
    // bare handle. The handle becomes the display label (subFlow).
    onSelectAudricUser(r.address, r.fullHandle);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setValue(text.trim());
      }
    } catch {
      // clipboard access denied
    }
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-4 space-y-3 feed-row shadow-[var(--shadow-flat)]">
      <p className="text-[13px] text-fg-secondary">Who do you want to send to?</p>
      {contacts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {contacts.map((c) => (
            <button
              key={c.address}
              type="button"
              onClick={() => onSelectContact(c.address, c.name)}
              className="rounded-pill border border-border-subtle bg-transparent px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary hover:border-border-strong hover:text-fg-primary hover:bg-surface-sunken transition"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            // [B2 polish] Parallel noun structure (was: "@audric-handle,
            // address (0x...), or contact" — mixed format, hyphenated
            // jargon, parens). Three paths in canonical-noun form, with
            // the new SPEC 10 dominant path (@username) first; "username"
            // matches the noun used in sidebar / settings / picker /
            // change modal / claim modal — no more "audric-handle".
            placeholder="@username, contact name, or 0x address"
            autoFocus
            className="flex-1 rounded-lg border border-border-subtle bg-surface-page px-4 py-3 text-[14px] text-fg-primary placeholder:text-fg-muted outline-none focus:border-border-strong transition-colors"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls="send-recipient-handle-dropdown"
          />
          {value.trim() && !isAtPrefix ? (
            <button
              type="button"
              onClick={handleSubmit}
              className="bg-fg-primary rounded-lg px-4 py-2 font-mono text-[10px] tracking-[0.1em] uppercase font-medium text-fg-inverse transition hover:opacity-80 active:scale-[0.97]"
            >
              Go
            </button>
          ) : !isAtPrefix ? (
            <button
              type="button"
              onClick={handlePaste}
              className="rounded-lg border border-border-subtle bg-surface-page px-4 py-2 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-secondary transition hover:text-fg-primary hover:border-border-strong hover:bg-surface-sunken active:scale-[0.97]"
            >
              Paste
            </button>
          ) : null}
        </div>
        {showDropdown && (
          <div
            id="send-recipient-handle-dropdown"
            role="listbox"
            data-testid="send-recipient-handle-dropdown"
            className="absolute left-0 right-0 top-full mt-2 z-10 rounded-lg border border-border-subtle bg-surface-card shadow-[var(--shadow-flat)] overflow-hidden"
          >
            {isSearching && searchResults.length === 0 && (
              <p className="px-4 py-3 text-[12px] text-fg-secondary">Searching Audric users…</p>
            )}
            {!isSearching && searchResults.length === 0 && (
              <p className="px-4 py-3 text-[12px] text-fg-secondary">
                No Audric user matches <span className="font-mono">@{atQuery}</span>. Paste a 0x address or pick a contact above.
              </p>
            )}
            {searchResults.map((r) => {
              const known = isKnownAddress(r.address) || savedAddrs.has(r.address);
              const saving = savingAddr === r.address;
              const handleSave = async (e: React.MouseEvent) => {
                e.stopPropagation();
                if (saving || known) return;
                setSavingAddr(r.address);
                try {
                  await onSaveAudricUser(r.address, r.username);
                  setSavedAddrs((prev) => {
                    const next = new Set(prev);
                    next.add(r.address);
                    return next;
                  });
                } finally {
                  setSavingAddr(null);
                }
              };
              return (
                <div
                  key={r.address}
                  className="w-full flex items-center hover:bg-surface-sunken transition-colors"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => handlePickResult(r)}
                    className="flex-1 min-w-0 px-4 py-2.5 text-left flex items-center justify-between gap-3"
                  >
                    <span className="text-[13px] text-fg-primary font-mono truncate">
                      {r.fullHandle}
                    </span>
                    <span className="text-[11px] text-fg-muted font-mono shrink-0">
                      {`${r.address.slice(0, 6)}…${r.address.slice(-4)}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleSave(e)}
                    disabled={saving || known}
                    aria-label={
                      known
                        ? `${r.fullHandle} is already in your contacts`
                        : `Save ${r.fullHandle} to contacts`
                    }
                    title={
                      known
                        ? 'Already in contacts'
                        : `Save ${r.username} to contacts`
                    }
                    className="shrink-0 px-3 py-2.5 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary disabled:opacity-50 disabled:cursor-default focus-visible:outline-none focus-visible:underline"
                  >
                    {known ? '\u2713' : saving ? '\u2026' : '+'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {onCancel && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition underline underline-offset-2"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export interface DashboardContentProps {
  initialSessionId?: string;
}

export function DashboardContent({ initialSessionId }: DashboardContentProps = {}) {
  const { address, session, refresh } = useZkLogin();
  const { panel, setPanel } = usePanel();

  const chipFlow = useChipFlow();
  const feed = useFeed();
  const contactsHook = useContacts(address);
  const { agent } = useAgent();
  // Refetch the contacts tab whenever the LLM resolves a `save_contact`
  // call. The tool now persists to Postgres directly via Prisma (see
  // `lib/engine/contact-tools.ts`), so this hook is the canonical reader
  // — without the refetch the contacts tab would stay stale until reload.
  const engine = useEngine({
    address,
    jwt: session?.jwt,
    onToolResult: (event) => {
      if (event.toolName === 'save_contact' && !event.isError) {
        void contactsHook.refetch();
      }
    },
    // [SPEC 7 P2.5b Layer 5] Pass contacts to the timeline reducer so
    // it can inject synthetic `CONTACT · "<name>"` rows when a tool /
    // bundle input references a known contact name.
    contacts: contactsHook.contacts,
  });

  // ─── Voice mode (Claude-style continuous loop) ────────────────────
  // The hook is engine-agnostic: it owns the mic + TTS lifecycle and
  // calls back into useEngine via `submitAndAwaitReply`. Pulling the
  // status from /api/voice/status keeps the mic button hidden on
  // deployments without OPENAI_API_KEY / ELEVENLABS_API_KEY configured.
  //
  // CRITICAL: `useEngine.sendMessage` internally awaits the entire SSE
  // stream, so the awaiter must register its falling-edge listener
  // *before* the kickoff fires. The awaiter wraps that ordering.
  const voiceStatus = useVoiceStatus();
  const awaitReply = useEngineReplyAwaiter(engine.isStreaming, engine.messages);
  const sendMessageRef = useRef(engine.sendMessage);
  sendMessageRef.current = engine.sendMessage;
  const submitAndAwaitReplyRef = useRef<(text: string) => Promise<string>>(
    async () => '',
  );
  submitAndAwaitReplyRef.current = (text: string) =>
    awaitReply(() => sendMessageRef.current(text));
  const voice = useVoiceMode({
    address,
    jwt: session?.jwt,
    submitAndAwaitReply: (text) => submitAndAwaitReplyRef.current(text),
  });

  // The id of the message currently being spoken. After `sendMessage`
  // the engine guarantees the last array element is the freshly-streamed
  // assistant message, so we anchor highlighting to that id.
  const speakingMessageId =
    voice.state === 'speaking'
      ? (() => {
          const last = engine.messages[engine.messages.length - 1];
          return last && last.role === 'assistant' ? last.id : null;
        })()
      : null;

  const initialSessionLoaded = useRef(false);
  useEffect(() => {
    if (initialSessionLoaded.current || !initialSessionId || !session?.jwt) return;
    initialSessionLoaded.current = true;
    engine.loadSession(initialSessionId);
    // `engine` is recreated on every render (useEngine returns a fresh object),
    // so this effect re-attaches each render — but the `initialSessionLoaded`
    // ref guards `loadSession` from firing more than once.
  }, [initialSessionId, session?.jwt, engine]);

  // [Bug 2 / 2026-04-27] Keep URL on /chat/{sessionId} whenever the chat
  // panel is active AND a session exists. Pre-fix this effect only ran on
  // sessionId changes, so subsequent setPanel('chat') calls (from chip clicks
  // in Portfolio/Pay/Activity panels) pushed `/new` and the URL got stuck
  // there even though the in-memory session was alive. By also depending on
  // `panel`, we re-sync the URL on every transition back into chat.
  useEffect(() => {
    if (!engine.sessionId) return;
    if (panel !== 'chat') return;
    const target = `/chat/${engine.sessionId}`;
    if (window.location.pathname !== target) {
      window.history.replaceState(window.history.state, '', target);
    }
  }, [engine.sessionId, panel]);

  const balanceQuery = useBalance(address);
  const activityFeed = useActivityFeed(address);
  const userStatus = useUserStatus(address, session?.jwt);
  // [SPEC 10 B-wiring] Per-address localStorage skip flag for the username
  // claim gate. Lazy initializer reads localStorage once on mount (SSR-safe
  // via the typeof window guard); subsequent skip clicks update both state
  // and storage so the same browser tab respects the dismissal across
  // dashboard reloads. Settings page (D9) is the safety valve for re-claim.
  const [usernameSkipped, setUsernameSkipped] = useState<boolean>(() =>
    isUsernameSkipped(address),
  );
  // Address arrives from useZkLogin asynchronously, so the lazy initializer
  // above can't always see it. This effect picks up the flag once we have
  // an address — runs only when the address transitions from null → set.
  useEffect(() => {
    setUsernameSkipped(isUsernameSkipped(address));
  }, [address]);
  // [SPEC 10 B-wiring / review-fix #2] Optimistic-claimed flag — set the
  // moment the user clicks Continue on the success state, BEFORE the
  // userStatus refetch resolves (~200-500ms RTT). Without this, the
  // success card sits visible during the refetch and Continue feels
  // laggy. Once refetch lands, `userStatus.username` is non-null and
  // the gate stays hidden via the username-non-null path; the optimistic
  // flag is harmless past that point.
  const [usernameOptimisticallyClaimed, setUsernameOptimisticallyClaimed] = useState(false);
  const [agentBudget, setAgentBudget] = useState(0.50);
  // [v1.4 hotfix] Source of truth for the client-side permission tier gate
  // in <UnifiedTimeline>. Defaults to `balanced` when the user hasn't
  // explicitly set a preset; settings UI persists this via
  // POST /api/user/preferences { permissionPreset }.
  const [permissionPreset, setPermissionPreset] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');

  // [PR-B2] EmailCaptureModal + verify-link round-trip removed. The
  // session-tier (5 vs 20 sessions/day) now reads `email_verified` off
  // the Google OIDC JWT directly. No client-side capture, no modal, no
  // localStorage skip cooldown. The previous flow lived here from
  // S.5 → S.31 and is logged in audric-build-tracker.md.

  // Memoized so the dozen-plus useCallbacks below that include `balance` in
  // their deps don't re-create on every render. Pre-memo, every parent render
  // churned every callback's identity, defeating useCallback for the chip
  // flow + intent handlers downstream.
  const balance = useMemo(() => ({
    total: balanceQuery.data?.total ?? 0,
    cash: balanceQuery.data?.cash ?? 0,
    savings: balanceQuery.data?.savings ?? 0,
    borrows: balanceQuery.data?.borrows ?? 0,
    savingsRate: balanceQuery.data?.savingsRate ?? 0,
    healthFactor: balanceQuery.data?.healthFactor ?? null,
    maxBorrow: balanceQuery.data?.maxBorrow ?? 0,
    pendingRewards: balanceQuery.data?.pendingRewards ?? 0,
    bestSaveRate: balanceQuery.data?.bestSaveRate ?? null,
    currentRate: balanceQuery.data?.currentRate ?? 0,
    savingsBreakdown: balanceQuery.data?.savingsBreakdown ?? [],
    sui: balanceQuery.data?.sui ?? 0,
    suiUsd: balanceQuery.data?.suiUsd ?? 0,
    suiPrice: balanceQuery.data?.suiPrice ?? 0,
    usdc: balanceQuery.data?.usdc ?? 0,
    assetBalances: balanceQuery.data?.assetBalances ?? {},
    assetUsdValues: balanceQuery.data?.assetUsdValues ?? {},
    loading: balanceQuery.isLoading,
    error: balanceQuery.isError,
  }), [balanceQuery.data, balanceQuery.isLoading, balanceQuery.isError]);

  const chipExpand = useChipExpand({ idleUsdc: balance.usdc, currentApy: balance.savingsRate });

  // [v0.56 receive-toast] Stamped right before EVERY user-initiated write
  // tool runs (in handleExecuteAction). useReceiveToast reads it to
  // distinguish "I just withdrew → USDC went up" (suppress toast) from
  // "someone deposited → USDC went up" (fire toast). Ref vs state on
  // purpose — updating the timestamp shouldn't re-render every consumer.
  const lastUserActionAtRef = useRef<number>(0);

  // Surface a "+X USDC arrived" toast when polling detects an unexpected
  // USDC inbound delta. 30-second latency (poll cadence) is acceptable for
  // v1; future PR can layer Sui event subscriptions for sub-second push.
  useReceiveToast({ usdc: balanceQuery.data?.usdc, lastUserActionAtRef });

  // [SIMPLIFICATION DAY 5] dashInsights / scheduledActions / goalsHook
  // milestone derivation removed — backed by dropped tables and retired
  // dashboard surfaces. Goals still surface inside <GoalsPanel> via its
  // own useGoals hook.

  useEffect(() => {
    if (!address) return;
    fetch(`/api/user/preferences?address=${address}`)
      .then((r) => r.json())
      .then((data) => {
        const budget = data.limits?.agentBudget;
        if (typeof budget === 'number' && budget >= 0) setAgentBudget(budget);
        // [v1.4 hotfix] Pull the saved preset name so the timeline's
        // shouldClientAutoApprove gate honors it. Same shape returned
        // by the existing /api/user/preferences GET handler.
        const preset = data.permissionPreset;
        if (preset === 'conservative' || preset === 'balanced' || preset === 'aggressive') {
          setPermissionPreset(preset);
        }
      })
      .catch(() => {});
  }, [address]);

  const confirmResolverRef = useRef<((approved: boolean) => void) | null>(null);

  // Same memoization rationale as `balance` above — flowContext is included
  // in chip handler useCallback deps; recreating it every render churned
  // those callbacks.
  const flowContext: FlowContext = useMemo(() => ({
    cash: balance.cash,
    usdc: balance.usdc,
    savings: balance.savings,
    borrows: balance.borrows,
    savingsRate: balance.savingsRate,
    bestRate: balance.bestSaveRate?.rate,
    maxBorrow: balance.maxBorrow,
  }), [balance]);

  const fetchHistory = useCallback(async () => {
    if (!address) return;
    feed.addItem({ type: 'ai-text', text: 'Loading transaction history...' });
    try {
      const res = await fetch(`/api/history?address=${address}&limit=20`);
      const data = await res.json();
      feed.removeLastItem();
      if (data.items && data.items.length > 0) {
        feed.addItem({
          type: 'transaction-history',
          transactions: data.items,
          network: data.network ?? SUI_NETWORK,
        });
      } else {
        feed.addItem({
          type: 'ai-text',
          text: 'No transactions found yet. Make your first save or send to see your activity here.',
          chips: [{ label: 'Save', flow: 'save' }, { label: 'Receive', flow: 'receive' }],
        });
      }
    } catch {
      feed.removeLastItem();
      feed.addItem({
        type: 'ai-text',
        text: 'Could not load transaction history right now. Try again later.',
      });
    }
  }, [address, feed]);

  /**
   * [SPEC 10 Phase C.3 — bug fix] Resolve a typed send-recipient string
   * (whatever the user typed into SendRecipientInput, OR whatever the
   * intent parser yielded as `intent.to` from chat) into the
   * (recipient_address, display_label) pair the chip flow needs.
   *
   * Resolution order:
   *   1. Saved contact name → use the contact's address.
   *   2. SuiNS name (`*.sui`, including `*.audric.sui`) → call
   *      /api/suins/resolve. On success, recipient = 0x address,
   *      label = the typed name (so the user sees the friendly form
   *      they typed). On failure, surface the SuinsResolutionError
   *      message via chipFlow.setError — no chip-flow advance.
   *   3. Anything else (assumed `0x...`) → pass through. The prepare
   *      route validates strict 0x format and returns 400 if it's
   *      garbage, which the chip flow already surfaces correctly.
   *
   * Why this lives at the parent (not inside SendRecipientInput): the
   * same resolution applies to the chat-driven send path
   * (executeIntent → 'send' → intent.to). Two call sites, one helper.
   */
  const resolveAndSelectSendRecipient = useCallback(
    async (input: string, cash: number | undefined) => {
      const contact = contactsHook.resolveContact(input);
      if (contact) {
        chipFlow.selectRecipient(contact, input, cash);
        return;
      }
      if (looksLikeSuiNs(input)) {
        try {
          const address = await resolveSuiNs(input);
          chipFlow.selectRecipient(address, input, cash);
        } catch (err) {
          const message =
            err instanceof SuinsResolutionError
              ? err.message
              : `Couldn't resolve "${input}". Try again or paste a 0x address.`;
          chipFlow.setError(message);
        }
        return;
      }
      chipFlow.selectRecipient(input, undefined, cash);
    },
    [chipFlow, contactsHook],
  );

  const executeIntent = useCallback(
    (intent: ParsedIntent) => {
      if (!intent) return;

      switch (intent.action) {
        case 'save': {
          const cap = capForFlow('save', balance);
          if (cap <= 0) {
            feed.addItem({ type: 'ai-text', text: 'No USDC available to save right now.', chips: [{ label: 'Receive', flow: 'receive' }] });
          } else {
            chipFlow.startFlow('save', flowContext);
            const amt = intent.amount === -1 ? cap : intent.amount > 0 ? Math.min(intent.amount, cap) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        }
        case 'send': {
          const cap = capForFlow('send', balance);
          if (cap <= 0) {
            feed.addItem({ type: 'ai-text', text: 'No funds available to send right now.', chips: [{ label: 'Receive', flow: 'receive' }] });
          } else {
            chipFlow.startFlow('send', flowContext);
            // [SPEC 10 Phase C.3 — bug fix] Use the shared resolver so
            // chat-driven `send 5 to alice.audric.sui` and chip-typed
            // input go through the same SuiNS-aware path. Amount is
            // set inside the .then callback so it lands AFTER the
            // recipient resolves (chipFlow.selectAmount expects state
            // to already have the recipient).
            const sendAmt = intent.amount === -1 ? cap : intent.amount > 0 ? Math.min(intent.amount, cap) : 0;
            void resolveAndSelectSendRecipient(intent.to, flowContext.cash).then(() => {
              if (sendAmt > 0) chipFlow.selectAmount(sendAmt);
            });
          }
          break;
        }
        case 'withdraw':
          if (balance.savings <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'You don\'t have any savings to withdraw.',
              chips: [{ label: 'Save', flow: 'save' }],
            });
          } else {
            chipFlow.startFlow('withdraw', flowContext);
            const amt = intent.amount === -1 ? balance.savings : intent.amount > 0 ? Math.min(intent.amount, balance.savings) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        case 'borrow': {
          const cap = capForFlow('borrow', balance);
          if (cap <= 0) {
            feed.addItem({ type: 'ai-text', text: 'Nothing available to borrow. You need savings deposited as collateral first.', chips: [{ label: 'Save', flow: 'save' }] });
          } else {
            chipFlow.startFlow('borrow', flowContext);
            const amt = intent.amount === -1 ? cap : intent.amount > 0 ? Math.min(intent.amount, cap) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        }
        case 'repay':
          if (balance.borrows <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'You don\'t have any active debt to repay.',
              chips: [{ label: 'Borrow', flow: 'borrow' }],
            });
          } else {
            chipFlow.startFlow('repay', flowContext);
            const amt = intent.amount === -1 ? balance.borrows : intent.amount > 0 ? Math.min(intent.amount, balance.borrows) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        case 'claim-rewards':
          if (balance.pendingRewards <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'No pending rewards to claim right now.',
            });
          } else {
            feed.addItem({ type: 'ai-text', text: `Claiming $${balance.pendingRewards.toFixed(2)} in rewards...` });
            (async () => {
              try {
                if (!agent) throw new Error('Not authenticated');
                const sdk = await agent.getInstance();
                const res = await sdk.claimRewards();
                feed.removeLastItem();
                feed.addItem({
                  type: 'result',
                  success: true,
                  title: `Claimed $${balance.pendingRewards.toFixed(2)} in rewards`,
                  details: `Tx: ${res.tx.slice(0, 8)}...${res.tx.slice(-6)}`,
                });
                balanceQuery.refetch();
                setTimeout(() => balanceQuery.refetch(), 3000);
              } catch (err) {
                feed.removeLastItem();
                const msg = err instanceof Error ? err.message : 'Failed to claim rewards';
                feed.addItem({
                  type: 'ai-text',
                  text: `Claim failed: ${msg}`,
                  chips: [{ label: 'Try again', flow: 'claim-rewards' }],
                });
              }
            })();
          }
          break;
        case 'address':
          feed.addItem({
            type: 'receipt',
            title: 'Deposit Address',
            code: address ?? '',
            qr: true,
            // [2026-05-05] Receive QR now encodes a `sui:pay?recipient=…&coinType=…`
            // deep-link URI so phone-camera scans open Slush / Phantom / Suiet
            // directly with the address pre-filled, mirroring the Pay/invoice
            // flow. Pre-fix the receive QR carried only the bare 0x address (so
            // wallet-to-wallet "Send → Scan QR" recipient pickers parsed it as a
            // destination, while phone-camera scans dead-ended in the gallery).
            // The copyable text below still shows the bare 0x address (`code`)
            // for CEX-withdrawal pasting (Binance / Coinbase forms reject
            // `sui:pay?…` URIs as invalid addresses) — so both scan paths now
            // work: phone-camera → Slush deep-link, and copy-paste → CEX form.
            qrUri: address ? buildSuiPayUri({ recipient: address }) : undefined,
            // [SPEC 10 Phase C.4 — D8 hybrid identity] Surface the user's
            // claimed Audric handle ABOVE the QR (rendered by FeedRenderer).
            // Visitor sees `🪪 funkii.audric.sui · 0x40cd…3e62` over the
            // QR — full handle for verification + truncated address for
            // visual confirmation. Falls through to undefined when the
            // user hasn't claimed (rare — Phase B makes claiming
            // mandatory at signup).
            handle: userStatus.username
              ? `${userStatus.username}.audric.sui`
              : undefined,
            meta: [
              { label: 'Network', value: 'Sui (mainnet)' },
              { label: 'Token', value: 'USDC' },
            ],
            instructions: [
              {
                title: 'From Binance',
                steps: [
                  'Go to Withdraw → search "USDC"',
                  'Select network: **Sui**',
                  'Paste your address above',
                  'Enter amount and confirm',
                ],
              },
              {
                title: 'From Coinbase',
                steps: [
                  'Go to Send → select USDC',
                  'Choose network: **Sui**',
                  'Paste your address above',
                  'Enter amount and confirm',
                ],
              },
              {
                title: 'From any Sui wallet',
                steps: [
                  'Send USDC to the address above',
                ],
              },
              // [Option A / 2026-04-30] Card on-ramp via Mercuryo. This is the
              // smallest-possible ship of the deferred PR-B4 spec — a single
              // markdown link inline in the existing deposit-address receipt
              // instead of a dedicated modal + engine tool + settings link.
              //
              // Why two-hop: Mercuryo doesn't issue Sui-native USDC directly,
              // so the path is buy SUI on card → swap SUI→USDC via the Cetus
              // swap chip. Fee stack (Mercuryo 3-5% + Cetus 0.1%) is real, so
              // we surface it after a CEX exchange transfer (the cheaper path)
              // rather than leading with it. Same widget URL as the CLI's
              // `init` step (packages/cli/src/commands/init.ts) — single source
              // of truth for the on-ramp link.
              {
                title: 'From a card (no exchange)',
                steps: [
                  'Open [Mercuryo](https://exchange.mercuryo.io/?widget_id=89960d1a-8db7-49e5-8823-4c5e01c1cea2), buy SUI with your card to the address above',
                  'Then ask Audric **"swap all my SUI to USDC"** to convert it',
                ],
              },
            ],
          });
          break;
        case 'balance': {
          const bd = balanceQuery.data;
          // [v0.55 Fix 2] "Wallet" instead of "Cash" — `balance.cash`
          // aggregates every priced wallet asset (USDC + SUI + tradeables),
          // not just stables, so "Cash" mismatched the user's mental model.
          // Internal property name kept as `cash` to avoid a wider rename.
          const stats: string[] = [
            `<<stat label="Wallet" value="$${balance.cash.toFixed(2)}" status="${balance.cash > 0 ? 'safe' : 'neutral'}">>`,
            `<<stat label="Savings" value="$${balance.savings.toFixed(2)}" status="${balance.savings > 0 ? 'safe' : 'neutral'}">>`,
          ];
          stats.push(`<<stat label="Total" value="$${balance.total.toFixed(2)}" status="${balance.total > 0 ? 'safe' : 'neutral'}">>`)
          if (balance.borrows > 0) {
            stats.push(`<<stat label="Debt" value="$${balance.borrows.toFixed(2)}" status="${balance.borrows > 1 ? 'warning' : 'safe'}">>`)
            if (balance.healthFactor && balance.healthFactor !== Infinity) {
              stats.push(`<<stat label="Health" value="${balance.healthFactor.toFixed(0)}" status="${balance.healthFactor > 2 ? 'safe' : 'danger'}">>`)
            }
          }
          if (bd) {
            if (bd.sui > 0) stats.push(`<<stat label="SUI" value="${bd.sui.toFixed(4)} ($${bd.suiUsd.toFixed(2)})" status="safe">>`);
            if (bd.usdc > 0) stats.push(`<<stat label="USDC" value="${bd.usdc.toFixed(2)}" status="safe">>`);
            for (const [symbol, amt] of Object.entries(bd.assetBalances)) {
              if (amt > 0) stats.push(`<<stat label="${symbol}" value="${amt < 0.01 ? amt.toFixed(8) : amt.toFixed(4)}" status="safe">>`);
            }
          }
          feed.addItem({ type: 'ai-text', text: stats.join('\n') });
          break;
        }
        case 'report': {
          const rd = balanceQuery.data;
          // [v0.55 Fix 2] "Wallet" instead of "Cash" — see comment in the
          // `balance` case above. Same reasoning, same surface.
          const rStats: string[] = [
            `<<stat label="Wallet" value="$${balance.cash.toFixed(2)}" status="${balance.cash > 0 ? 'safe' : 'neutral'}">>`,
            `<<stat label="Savings" value="$${balance.savings.toFixed(2)}" status="${balance.savings > 0 ? 'safe' : 'neutral'}">>`,
          ];
          if (balance.borrows > 0) {
            rStats.push(`<<stat label="Debt" value="$${balance.borrows.toFixed(2)}" status="${balance.borrows > 1 ? 'warning' : 'safe'}">>`)
          } else {
            rStats.push(`<<stat label="Debt" value="$0.00" status="safe">>`);
          }
          if (balance.savingsRate > 0) {
            rStats.push(`<<stat label="Yield" value="${(balance.savingsRate * 100).toFixed(1)}% APY" status="safe">>`);
          }
          if (balance.healthFactor && balance.healthFactor !== Infinity && balance.borrows > 0) {
            rStats.push(`<<stat label="Health" value="${balance.healthFactor.toFixed(0)}" status="${balance.healthFactor > 2 ? 'safe' : 'danger'}">>`)
          }
          if (rd) {
            if (rd.sui > 0) rStats.push(`<<stat label="SUI" value="${rd.sui.toFixed(4)} ($${rd.suiUsd.toFixed(2)})" status="safe">>`);
            if (rd.usdc > 0) rStats.push(`<<stat label="USDC" value="${rd.usdc.toFixed(2)}" status="safe">>`);
            for (const [symbol, amt] of Object.entries(rd.assetBalances)) {
              if (amt > 0) rStats.push(`<<stat label="${symbol}" value="${amt < 0.01 ? amt.toFixed(8) : amt.toFixed(4)}" status="safe">>`);
            }
          }
          feed.addItem({ type: 'ai-text', text: rStats.join('\n') });
          break;
        }
        case 'history':
          fetchHistory();
          break;
        case 'rates': {
          const rtStats: string[] = [];
          if (balance.savingsRate > 0) {
            rtStats.push(`<<stat label="Your Rate" value="${(balance.savingsRate * 100).toFixed(1)}% APY" status="safe">>`);
          }
          if (balance.bestSaveRate) {
            const isBetter = balance.bestSaveRate.rate > balance.savingsRate + 0.003;
            rtStats.push(`<<stat label="Best Available" value="${(balance.bestSaveRate.rate * 100).toFixed(1)}% APY" status="${isBetter ? 'safe' : 'neutral'}">>`)
            rtStats.push(`<<stat label="Protocol" value="${balance.bestSaveRate.protocol}" status="neutral">>`)
          }
          if (balance.savings > 0 && balance.savingsRate > 0) {
            const monthly = (balance.savings * balance.savingsRate) / 12;
            rtStats.push(`<<stat label="Monthly Earnings" value="~$${monthly.toFixed(2)}" status="neutral">>`);
          }
          if (rtStats.length === 0) {
            feed.addItem({ type: 'ai-text', text: 'No rate data available yet — rates refresh every 30s.' });
          } else {
            feed.addItem({
              type: 'ai-text',
              text: rtStats.join('\n'),
              chips: balance.usdc > 5
                ? [{ label: 'Save', flow: 'save' }]
                : [],
            });
          }
          break;
        }
        case 'help':
          feed.addItem({
            type: 'ai-text',
            text: 'Here\'s what I can help with:\n\n• Save — Earn yield on idle USDC\n• Send — Transfer USDC to anyone\n• Borrow — Against your savings\n• Report — Full financial summary\n\nI can also search the web, send emails, translate, generate images, and more — just type what you need.',
          });
          break;
      }
    },
    [chipFlow, feed, address, balance, balanceQuery, flowContext, agent, fetchHistory, userStatus.username, resolveAndSelectSendRecipient],
  );

  const handleChipClick = useCallback(
    (flow: string) => {
      if (flow === 'refresh-session') { refresh(); return; }

      if (flow === 'claim-rewards') { chipFlow.reset(); executeIntent({ action: 'claim-rewards' }); return; }
      if (flow === 'help') { chipFlow.reset(); executeIntent({ action: 'help' }); return; }
      if (flow === 'report') { chipFlow.reset(); executeIntent({ action: 'report' }); return; }
      if (flow === 'history') { chipFlow.reset(); executeIntent({ action: 'history' }); return; }
      if (flow === 'receive') { chipFlow.reset(); executeIntent({ action: 'address' }); return; }
      if (flow === 'balance') { chipFlow.reset(); executeIntent({ action: 'balance' }); return; }
      if (flow === 'rates') { chipFlow.reset(); executeIntent({ action: 'rates' }); return; }
      if (flow === 'charts') { chipFlow.reset(); engine.sendMessage('Show me my activity heatmap and a yield projector'); return; }

      if (flow === 'save-all') {
        chipFlow.startFlow('save', flowContext);
        chipFlow.selectAmount(balance.usdc);
        return;
      }
      if (flow === 'risk-explain') {
        chipFlow.reset();
        feed.addItem({
          type: 'ai-text',
          text: 'Your health factor measures how safe your loan is. Below 1.5 means you\'re close to liquidation — repaying even a small amount brings it back to a safer level.',
          chips: [{ label: 'Repay $50', flow: 'repay' }],
        });
        return;
      }
      if (flow === 'repay' && balance.borrows <= 0) {
        chipFlow.reset();
        feed.addItem({
          type: 'ai-text',
          text: 'You don\'t have any active debt to repay.',
          chips: [{ label: 'Borrow', flow: 'borrow' }],
        });
        return;
      }
      if (flow === 'withdraw' && balance.savings <= 0) {
        chipFlow.reset();
        feed.addItem({
          type: 'ai-text',
          text: 'You don\'t have any savings to withdraw. Save first to earn yield.',
          chips: [{ label: 'Save', flow: 'save' }],
        });
        return;
      }
      chipFlow.startFlow(flow, flowContext);
    },
    [chipFlow, feed, executeIntent, balance, flowContext, refresh, engine],
  );

  const handleInputSubmit = useCallback(
    async (text: string) => {
      if (!address) return;
      if (panel !== 'chat') {
        setPanel('chat');
      }
      engine.sendMessage(text);
    },
    [address, engine, panel, setPanel],
  );

  // [SPEC 10 D.2 + S.83 narration hotfix] Global search → balance check.
  // When the user picks a generic SuiNS or 0x result from the sidebar
  // search, route to chat and dispatch a kind-specific prompt:
  //
  //   - `suins`   → "Check the balance at 0x… — this address is the
  //                 SuiNS name `funkii.sui`. This is NOT an Audric
  //                 handle; do NOT narrate it as `funkii.audric.sui`."
  //   - `address` → "Check the balance at 0x…."
  //
  // The explicit "NOT an Audric handle" clause is load-bearing: pre-S.83
  // a permissive prompt let the agent expand `funkii.sui` into
  // `funkii.audric.sui` (different on-chain entity, different owner).
  // The system-prompt D10 rule was strengthened in the same hotfix.
  const handleSearchCheckBalance = useCallback(
    (target: string, label: string, kind: 'suins' | 'address') => {
      if (!address) return;
      if (panel !== 'chat') setPanel('chat');
      const prompt =
        kind === 'suins'
          ? `Check the wallet balance at address ${target}. This address is the SuiNS name \`${label}\`. This is NOT an Audric handle — do NOT narrate it as \`${label.replace(/\.sui$/, '.audric.sui')}\`. Refer to it strictly as \`${label}\` (the form the user typed) or as the address.`
          : `Check the wallet balance at address ${target}.`;
      engine.sendMessage(prompt);
    },
    [address, engine, panel, setPanel],
  );

  const handleFeedChipClick = useCallback(
    (flowOrLabel: string) => {
      const intent = parseIntent(flowOrLabel);
      if (intent) {
        executeIntent(intent);
        return;
      }
      const flow = resolveFlow(flowOrLabel) ?? flowOrLabel;
      handleChipClick(flow);
    },
    [handleChipClick, executeIntent],
  );

  const handleNewConversation = useCallback(() => {
    engine.clearMessages();
    feed.clear();
    chipFlow.reset();
    window.history.replaceState(window.history.state, '', '/new');
  }, [engine, feed, chipFlow]);

  const handleActivityAction = useCallback((flow: string) => {
    setPanel('chat');
    handleChipClick(flow);
  }, [handleChipClick, setPanel]);

  // [Bug 3 / 2026-04-27] EXPLAIN button on each ActivityCard. Switch to chat
  // and ask the agent to explain the transaction — the LLM dispatches the
  // engine `explain_tx` tool against the digest.
  const handleExplainTx = useCallback((digest: string) => {
    setPanel('chat');
    handleInputSubmit(`Explain transaction ${digest}`);
  }, [handleInputSubmit, setPanel]);

  // [SIMPLIFICATION DAY 5] handleBriefing* + handleWelcome* removed with
  // BriefingCard / FirstLoginView / DailyBriefing cron stack.

  // Deep link: ?prefill=... auto-sends a message on load
  // [Bug 2 / 2026-04-27] Strip ?prefill= without clobbering an active
  // session URL. The `useEffect` above ([engine.sessionId, panel]) will land
  // us back on /chat/{id} once the session resolves; here we just remove
  // the search params on the current pathname instead of forcing /new.
  const searchParams = useSearchParams();
  const prefillHandled = useRef(false);
  useEffect(() => {
    if (prefillHandled.current) return;
    const prefill = searchParams.get('prefill');
    if (prefill && address) {
      prefillHandled.current = true;
      handleInputSubmit(decodeURIComponent(prefill));
      const cleanPath = window.location.pathname || '/new';
      window.history.replaceState({}, '', cleanPath);
    }
  }, [searchParams, address, handleInputSubmit]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const validateAction = useCallback(
    (toolName: string, input: unknown): string | null => {
      if (!['send_transfer', 'save_deposit', 'swap_execute'].includes(toolName)) return null;
      const inp = (input ?? {}) as Record<string, unknown>;
      const reqAmount = Number(inp.amount ?? 0);
      if (reqAmount <= 0) return null;
      const assetKey = (toolName === 'swap_execute'
        ? (inp.from ?? inp.fromAsset ?? 'USDC')
        : (inp.asset ?? 'USDC')) as string;
      const sym = assetKey.toUpperCase();
      const bd = balanceQuery.data;
      let available = 0;
      if (sym === 'USDC') available = bd?.usdc ?? 0;
      else if (sym === 'SUI') available = bd?.sui ?? 0;
      else available = bd?.assetBalances?.[sym] ?? bd?.assetBalances?.[assetKey] ?? 0;
      if (reqAmount > available + 0.01) {
        return `Insufficient ${assetKey}: you have ${available.toFixed(2)} but requested ${reqAmount}`;
      }
      return null;
    },
    [balanceQuery.data],
  );

  // [v1.4] Pure SDK-call logic lives in executeToolAction (apps/web/hooks/executeToolAction.ts);
  // this wrapper adds React-side effects (balance refetch, contact resolution).
  const handleExecuteAction = useCallback(
    async (toolName: string, input: unknown): Promise<{ success: boolean; data: unknown }> => {
      if (!agent) throw new Error('Not authenticated');
      const sdk = await agent.getInstance();

      // [v0.56 receive-toast] Stamp the user-action timestamp BEFORE running
      // the tool. useReceiveToast suppresses receive notifications within a
      // 60s grace window so the user's own withdraw / swap-to-USDC / etc.
      // doesn't surface as "+X USDC arrived". Stamped pre-call (vs post)
      // because the tool can take ~5–10s to settle and the next balance
      // poll might already be in flight.
      lastUserActionAtRef.current = Date.now();

      const result = await executeToolAction(sdk, toolName, input, {
        resolveContact: (raw) => contactsHook.resolveContact(raw),
        // [v0.55 Fix 3] Real SuiNS resolution. Async, server-routed via
        // /api/suins/resolve. Throws SuinsResolutionError on failure so
        // the LLM narrates the truthful reason (not registered, RPC down)
        // instead of confabulating "I tried that already".
        resolveSuiNs: async (raw) => {
          const { resolveSuiNs } = await import('@/lib/suins-resolver');
          return resolveSuiNs(raw);
        },
      });

      // Side effects after a successful execution. Refetch balance for any
      // tool that moves funds. Tools with longer settlement (swap, volo)
      // also schedule a delayed refetch.
      if (result.success && toolName !== 'save_contact' && toolName !== 'pay_api') {
        balanceQuery.refetch();
        if (toolName === 'swap_execute' || toolName === 'volo_stake' || toolName === 'volo_unstake') {
          setTimeout(() => balanceQuery.refetch(), 3000);
        }
      }

      return result;
    },
    [agent, balanceQuery, contactsHook],
  );

  // [SPEC 7 P2.4 Layer 3] Multi-write Payment Intent executor. Mirrors
  // `handleExecuteAction` for single-writes — dispatches the engine-emitted
  // intent through `executeBundleAction`, which posts to /api/transactions/
  // prepare with `type: 'bundle'` and assembles the steps into one Payment
  // Intent server-side via composeTx. The whole intent is one atomic tx
  // (all-succeed-or-all-revert).
  const handleExecuteBundle = useCallback(
    async (action: PendingAction) => {
      if (!agent) throw new Error('Not authenticated');
      const sdk = await agent.getInstance();

      lastUserActionAtRef.current = Date.now();

      // [F7 / SPEC 12] Pass the same contact + SuiNS resolvers as
      // `handleExecuteAction`. Without this, a `send_transfer` step with
      // `to: "<contactName>"` (which the system prompt explicitly tells
      // the LLM to emit) reaches the SDK unresolved and Enoki rejects
      // the dry-run with a non-obvious CommandArgumentError. Symmetry
      // with single-write means saved contacts work consistently in
      // both flows.
      const result = await executeBundleAction(sdk, action, {
        resolveContact: (raw) => contactsHook.resolveContact(raw),
        resolveSuiNs: async (raw) => {
          const { resolveSuiNs } = await import('@/lib/suins-resolver');
          return resolveSuiNs(raw);
        },
      });

      // Refetch balance once for the whole bundle (vs per-step). Bundles
      // typically contain a swap or volo step → schedule a delayed
      // refetch too. Cheap to over-refetch; expensive to miss a state
      // change after a 3-op stream.
      if (result.success) {
        balanceQuery.refetch();
        const hasDelayedSettlement = action.steps?.some(
          (s) =>
            s.toolName === 'swap_execute' ||
            s.toolName === 'volo_stake' ||
            s.toolName === 'volo_unstake',
        );
        if (hasDelayedSettlement) {
          setTimeout(() => balanceQuery.refetch(), 3000);
        }
      }

      return result;
    },
    [agent, balanceQuery, contactsHook],
  );

  const handleSaveContact = useCallback(
    async (name: string, addr: string) => {
      await contactsHook.addContact(name, addr);
      feed.addItem({
        type: 'ai-text',
        text: `Saved "${name}" as a contact. Next time you send, just type their name.`,
      });
    },
    [contactsHook, feed],
  );

  // [B3 polish G4] Save-sender from receipt. The TransactionHistoryCard
  // renders a `+` on incoming-from-stranger rows; clicking it lands here.
  // We spawn the same `contact-prompt` feed item B4 already shipped, so
  // the toast UI and skip/save plumbing match the post-send happy path
  // exactly (one ContactToast component, one save handler, one skip
  // policy). Defensive: only fire if the address is genuinely unknown
  // by the time the click lands (race-safe — user might've saved it
  // via another surface in between).
  const handlePromptSaveSender = useCallback(
    (address: string) => {
      if (contactsHook.isKnownAddress(address)) return;
      if (isContactPromptSkipped(address)) return;
      feed.addItem({ type: 'contact-prompt', address });
    },
    [contactsHook, feed],
  );

  const handleAmountSelect = useCallback(
    (amount: number) => {
      const flow = chipFlow.state.flow ?? '';
      const cap = capForFlow(flow, balance);

      if (amount === -1) {
        chipFlow.selectAmount(cap);
      } else {
        chipFlow.selectAmount(Math.min(amount, cap));
      }
    },
    [chipFlow, balance],
  );

  const heldAmount = useCallback(
    (symbol: string): number => {
      const sym = symbol.toUpperCase();
      if (sym === 'USDC') return balance.usdc;
      if (sym === 'SUI') return balance.sui;
      return balance.assetBalances[symbol] ?? balance.assetBalances[sym] ?? 0;
    },
    [balance],
  );

  const heldUsd = useCallback(
    (symbol: string): number => {
      const sym = symbol.toUpperCase();
      if (sym === 'USDC') return balance.usdc;
      if (sym === 'SUI') return balance.suiUsd;
      return balance.assetUsdValues[symbol] ?? balance.assetUsdValues[sym] ?? 0;
    },
    [balance],
  );

  const handleSwapAmountSelect = useCallback(
    (amount: number) => {
      const from = chipFlow.state.asset ?? '';
      const held = heldAmount(from);
      const actual = amount === -1 ? held : Math.min(amount, held);
      chipFlow.selectAmount(actual);

      const toAsset = chipFlow.state.toAsset;
      if (!toAsset || !address) return;
      if (actual <= 0) return;
      fetch(`/api/swap/quote?from=${encodeURIComponent(from)}&to=${encodeURIComponent(toAsset)}&amount=${actual}&address=${address}`)
        .then((r) => r.json())
        .then((q) => {
          if (q.error) throw new Error(q.error);
          const perUnit = actual > 0 ? (q.toAmount / actual).toFixed(6) : '?';
          chipFlow.setQuote({
            toAmount: q.toAmount,
            priceImpact: Number(q.priceImpact),
            rate: `1 ${from} = ${perUnit} ${toAsset}`,
          });
        })
        .catch(() => {
          chipFlow.setQuote({ toAmount: 0, priceImpact: 0, rate: 'Quote unavailable' });
        });
    },
    [chipFlow, heldAmount, address],
  );

  const getSwapFromAssets = useCallback((): SwapAsset[] => {
    const assets: SwapAsset[] = [];
    const seen = new Set<string>();
    const allSymbols = ['USDC', 'SUI', ...Object.keys(balance.assetBalances)];
    for (const sym of allSymbols) {
      const key = sym.toUpperCase();
      if (seen.has(key)) continue;
      const amt = heldAmount(sym);
      const usd = heldUsd(sym);
      if (amt <= 0.000001 || usd < 0.01) continue;
      assets.push({ symbol: key === 'USDC' || key === 'SUI' ? key : sym, amount: amt, usdValue: usd });
      seen.add(key);
    }
    assets.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
    return assets;
  }, [balance, heldAmount, heldUsd]);

  const getSwapToAssets = useCallback((): SwapAsset[] => {
    const from = chipFlow.state.asset ?? '';
    const assets: SwapAsset[] = [];
    const pinned = ['USDC', 'SUI'];
    for (const sym of pinned) {
      if (sym === from) continue;
      const meta = COIN_REGISTRY[sym];
      if (meta?.tier) assets.push({ symbol: sym });
    }
    for (const [sym, meta] of Object.entries(COIN_REGISTRY)) {
      if (!meta.tier || sym === from || pinned.includes(sym)) continue;
      assets.push({ symbol: sym });
    }
    return assets;
  }, [chipFlow.state.asset]);

  const getSwapAmountPresets = useCallback((): number[] => {
    const from = chipFlow.state.asset ?? '';
    const held = heldAmount(from);
    if (held <= 0) return [];
    const dp = held >= 1 ? 100 : held >= 0.01 ? 10000 : 100000000;
    const q25 = Math.floor(held * 0.25 * dp) / dp;
    const q50 = Math.floor(held * 0.5 * dp) / dp;
    const q75 = Math.floor(held * 0.75 * dp) / dp;
    return [q25, q50, q75].filter((v) => v > 0);
  }, [chipFlow.state.asset, heldAmount]);

  const getSwapHeldAmount = useCallback((): number => {
    return heldAmount(chipFlow.state.asset ?? '');
  }, [chipFlow.state.asset, heldAmount]);

  const handleSwapFromSelect = useCallback(
    (symbol: string) => {
      const autoTarget = symbol.toUpperCase() !== 'USDC' ? 'USDC' : undefined;
      chipFlow.selectFromAsset(symbol, autoTarget);
    },
    [chipFlow],
  );

  const handleConfirm = useCallback(async () => {
    chipFlow.confirm();

    const flow = chipFlow.state.flow;
    const cap = capForFlow(flow ?? '', balance);
    const rawAmount = chipFlow.state.amount ?? 0;
    const amount = Math.min(rawAmount, cap);

    try {
      if (!agent) throw new Error('Not authenticated');
      const sdk = await agent.getInstance();

      let txDigest = '';
      let flowLabel = '';

      const protocol = chipFlow.state.protocol ?? undefined;

      switch (flow) {
        case 'save': {
          const res = await sdk.save({ amount, protocol });
          txDigest = res.tx;
          flowLabel = 'Saved';
          break;
        }
        case 'send': {
          const recipient = chipFlow.state.recipient;
          if (!recipient) throw new Error('No recipient specified');
          let sendAsset: string | undefined;
          let sendAmount = amount;
          if (amount > balance.usdc && balance.sui > 0) {
            sendAsset = 'SUI';
            sendAmount = balance.suiPrice > 0 ? amount / balance.suiPrice : 0;
          }
          const res = await sdk.send({ to: recipient, amount: sendAmount, asset: sendAsset });
          txDigest = res.tx;
          flowLabel = 'Sent';
          break;
        }
        case 'withdraw': {
          const primary = balance.savingsBreakdown.length > 0
            ? balance.savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
            : null;
          const fromAsset = primary?.asset ?? 'USDC';
          const toAsset = fromAsset !== 'USDC' ? 'USDC' : undefined;
          const res = await sdk.withdraw({
            amount,
            protocol: protocol ?? primary?.protocolId,
            fromAsset: fromAsset !== 'USDC' ? fromAsset : undefined,
            toAsset,
          });
          txDigest = res.tx;
          flowLabel = 'Withdrew';
          break;
        }
        case 'borrow': {
          const res = await sdk.borrow({ amount, protocol });
          txDigest = res.tx;
          flowLabel = 'Borrowed';
          break;
        }
        case 'repay': {
          const res = await sdk.repay({ amount, protocol });
          txDigest = res.tx;
          flowLabel = 'Repaid';
          break;
        }
        case 'swap': {
          const fromAsset = chipFlow.state.asset;
          const toAsset = chipFlow.state.toAsset;
          if (!fromAsset || !toAsset) throw new Error('Swap assets not selected');
          const swapAmount = chipFlow.state.amount ?? 0;
          const res = await sdk.swap({ from: fromAsset, to: toAsset, amount: swapAmount });
          const swapData = buildSwapDisplayData(res.balanceChanges, fromAsset, toAsset, swapAmount);
          const explorerBase = SUI_NETWORK === 'testnet'
            ? 'https://suiscan.xyz/testnet/tx'
            : 'https://suiscan.xyz/mainnet/tx';
          const swapTxUrl = res.tx ? `${explorerBase}/${res.tx}` : undefined;
          const receivedStr = swapData.toAmount != null ? swapData.toAmount.toFixed(2) : '~';
          const swapResult: ChipFlowResult = {
            success: true,
            title: `Swapped ${swapData.fromAmount.toFixed(2)} ${swapData.fromToken} for ${receivedStr} ${swapData.toToken}`,
            details: res.tx
              ? `Tx: ${res.tx.slice(0, 8)}...${res.tx.slice(-6)}`
              : 'Swap confirmed on-chain.',
            txUrl: swapTxUrl,
          };
          chipFlow.setResult(swapResult);
          feed.addItem({
            type: 'result',
            success: true,
            title: swapResult.title,
            details: swapResult.details,
            txUrl: swapTxUrl,
          });
          balanceQuery.refetch();
          setTimeout(() => balanceQuery.refetch(), 3000);
          return;
        }
        default:
          throw new Error(`Unknown flow: ${flow}`);
      }

      const explorerBase = SUI_NETWORK === 'testnet'
        ? 'https://suiscan.xyz/testnet/tx'
        : 'https://suiscan.xyz/mainnet/tx';
      const txUrl = txDigest ? `${explorerBase}/${txDigest}` : undefined;
      const result: ChipFlowResult = {
        success: true,
        title: `${flowLabel} $${amount.toFixed(2)}`,
        details: txDigest
          ? `Tx: ${txDigest.slice(0, 8)}...${txDigest.slice(-6)}`
          : 'Transaction confirmed on-chain.',
        txUrl,
      };
      chipFlow.setResult(result);

      feed.addItem({
        type: 'result',
        success: true,
        title: result.title,
        details: result.details,
        txUrl,
      });

      balanceQuery.refetch();
      setTimeout(() => balanceQuery.refetch(), 3000);

      // [B4 polish] Contact-prompt triggering policy. Originally the
      // toast spawned after every send to a non-contact recipient; now
      // we suppress for: (a) sub-$1 USDC sends (test transfers, dust
      // splits — not worth nagging), (b) recipients the user has
      // already explicitly Skipped before (sticky per-address flag in
      // localStorage). We also pre-fill the name input from the
      // resolved Audric handle when present (`subFlow` ends with
      // `.audric.sui` → bare username) so the @-pick happy path is a
      // one-tap save instead of "what name?" → type → tap.
      if (
        flow === 'send' &&
        chipFlow.state.recipient &&
        !contactsHook.isKnownAddress(chipFlow.state.recipient) &&
        !isContactPromptSkipped(chipFlow.state.recipient) &&
        !(amount < 1)
      ) {
        const subFlow = chipFlow.state.subFlow ?? '';
        const defaultName = subFlow.endsWith('.audric.sui')
          ? subFlow.slice(0, -'.audric.sui'.length)
          : undefined;
        feed.addItem({
          type: 'contact-prompt',
          address: chipFlow.state.recipient,
          defaultName,
        });
      }
    } catch (err) {
      const errorData = mapError(err);
      chipFlow.setError(errorData.type === 'error' ? errorData.message : 'Transaction failed');
      feed.addItem(errorData);
    }
  }, [chipFlow, feed, agent, contactsHook, balanceQuery, balance]);

  const getConfirmationDetails = () => {
    const flow = chipFlow.state.flow;
    const amount = chipFlow.state.amount ?? 0;
    const details: { label: string; value: string }[] = [];

    if (flow === 'swap') {
      const from = chipFlow.state.asset ?? '?';
      const to = chipFlow.state.toAsset ?? '?';
      const q = chipFlow.state.quote;
      details.push({ label: 'Sell', value: `${amount} ${from}` });
      details.push({ label: 'Receive', value: q ? `~${q.toAmount.toFixed(4)} ${to}` : `Loading...` });
      if (q) {
        details.push({ label: 'Rate', value: q.rate });
        if (q.priceImpact > 0.001) {
          details.push({ label: 'Price impact', value: `${(q.priceImpact * 100).toFixed(2)}%` });
        }
      }
      details.push({ label: 'Fee', value: '0.1%' });
      details.push({ label: 'Gas', value: 'Sponsored' });
      return {
        title: `Swap ${amount} ${from} → ${to}`,
        confirmLabel: q ? `Swap ${amount} ${from}` : 'Fetching quote...',
        details,
      };
    }

    details.push({ label: 'Amount', value: `$${amount.toFixed(2)}` });

    if (flow === 'withdraw') {
      const primary = balance.savingsBreakdown.length > 0
        ? balance.savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
        : null;
      if (primary && primary.asset !== 'USDC') {
        details.push({ label: 'Conversion', value: `${primary.asset} → USDC (auto)` });
      }
    }

    if (flow === 'send' && chipFlow.state.recipient) {
      details.push({ label: 'To', value: chipFlow.state.subFlow ?? chipFlow.state.recipient });
    }

    if (flow === 'save') {
      const apyDecimal = balance.bestSaveRate?.rate ?? balance.savingsRate;
      if (apyDecimal > 0.005) {
        const apyPct = apyDecimal * 100;
        details.push({ label: 'APY', value: `${apyPct.toFixed(1)}%` });
        const monthly = (amount * apyDecimal) / 12;
        if (monthly >= 0.01) details.push({ label: 'Est. monthly', value: `+$${monthly.toFixed(2)}` });
      }
    }

    if (flow === 'borrow' && balance.savingsRate > 0) {
      details.push({ label: 'Collateral', value: `$${Math.floor(balance.savings)}` });
    }

    details.push({ label: 'Gas', value: 'Sponsored' });

    return {
      title: `${flow?.charAt(0).toUpperCase()}${flow?.slice(1)} $${amount.toFixed(2)}`,
      confirmLabel: `${flow?.charAt(0).toUpperCase()}${flow?.slice(1)} $${amount.toFixed(2)}`,
      details,
    };
  };

  const isInFlow = chipFlow.state.phase !== 'idle';
  const isEmpty = engine.messages.length === 0 && feed.items.length === 0 && !isInFlow;

  // [B1 polish F1+F6] Global keyboard handler for the chip-flow surface:
  //   - Escape       → cancels the entire flow (chipFlow.reset)
  //   - Enter        → confirms when phase is `confirming` and we're not
  //                    currently dispatching the tx (loading=true means
  //                    the user already pressed once)
  //
  // Skipped when the user is typing into a contenteditable / input /
  // textarea (otherwise hitting Esc inside SendRecipientInput's search
  // would cancel the flow when they meant to clear the dropdown). The
  // input components handle their own Enter / Esc inline; this handler
  // is the BACKSTOP for keypresses outside any focused field — the case
  // where the user has clicked in the chip surface but no input has
  // focus.
  // Slice the dependencies to the stable identities we actually use so
  // the listener is added/removed only when the phase transitions, not
  // on every chipFlow state mutation (subFlow / message / amount).
  const chipPhase = chipFlow.state.phase;
  const resetChipFlow = chipFlow.reset;
  useEffect(() => {
    if (chipPhase === 'idle' || chipPhase === 'executing') return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (inField) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        resetChipFlow();
      } else if (e.key === 'Enter' && chipPhase === 'confirming') {
        e.preventDefault();
        void handleConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [chipPhase, resetChipFlow, handleConfirm]);

  // [SIMPLIFICATION DAY 11] Greeting slide-out: keep <NewConversationView>
  // mounted for ~250ms after isEmpty flips false so we can run a fade-up
  // exit transition before swapping to the chat view. Without this, the
  // empty state would simply unmount instantly on first message.
  const [greetingMounted, setGreetingMounted] = useState(isEmpty);
  const [greetingExiting, setGreetingExiting] = useState(false);
  useEffect(() => {
    if (isEmpty) {
      setGreetingMounted(true);
      setGreetingExiting(false);
      return;
    }
    if (!greetingMounted) return;
    setGreetingExiting(true);
    const t = setTimeout(() => {
      setGreetingMounted(false);
      setGreetingExiting(false);
    }, 250);
    return () => clearTimeout(t);
  }, [isEmpty, greetingMounted]);

  if (!address || !session) return null;
  const email = decodeJwtClaim(session?.jwt, 'email');
  const googleName = decodeJwtClaim(session?.jwt, 'name');
  const greeting = getGreeting(userStatus.username);

  const tosBanner = !userStatus.loading && !userStatus.tosAccepted ? (
    <TosBanner onAccept={userStatus.acceptTos} />
  ) : null;

  // [SPEC 10 B-wiring] Gate-render decision: only show the picker when
  // we KNOW the user has no username AND hasn't dismissed via skip AND
  // hasn't just claimed (optimistic flag covers the refetch round-trip).
  const shouldShowUsernameGate =
    !userStatus.loading &&
    userStatus.username === null &&
    !usernameSkipped &&
    !usernameOptimisticallyClaimed;

  const handleUsernameClaimed = () => {
    // [review-fix #2] Optimistic flip BEFORE the refetch resolves so the
    // Continue click feels instant. The refetch updates the canonical
    // userStatus.username in the background; once it lands, the gate
    // stays hidden via the username-non-null check, so the optimistic
    // flag is structurally harmless past that point.
    setUsernameOptimisticallyClaimed(true);
    void userStatus.refetch();
  };

  const handleUsernameSkipped = () => {
    persistUsernameSkipped(address);
    setUsernameSkipped(true);
  };

  const renderEmptyState = () => {
    const dailyYield = balance.savings > 0 && balance.savingsRate > 0
      ? (balance.savings * balance.savingsRate) / 365
      : 0;

    // [SPEC 10 B-wiring / review-fix #1] While userStatus is loading on a
    // first signed-in render, neither the gate nor the regular empty
    // state can render correctly — picking either would flash the wrong
    // surface for ~100-300ms before the data arrives. Show a centred
    // spinner instead so the picker (or NewConversationView) materialises
    // ONCE without a stale-state flash. Same Spinner pattern as AuthGuard.
    if (userStatus.loading) {
      return (
        <div className="flex-1 flex items-center justify-center" data-testid="dashboard-empty-loading">
          <Spinner size="md" />
        </div>
      );
    }

    // [SPEC 10 B-wiring] Picker takes over the empty state at signup. Per
    // SPEC 10 D2, this is the "mandatory at signup with smart pre-fill"
    // surface — the user MUST claim or explicitly skip before reaching
    // the chat composer. The gate replaces (not overlays) the empty state
    // so there's no input bar to type past — the only paths forward are
    // claim or skip-link. Settings page (D9) is the safety valve.
    if (shouldShowUsernameGate && session?.jwt) {
      return (
        <div className="flex-1 flex flex-col items-center overflow-y-auto px-4 sm:px-6 pt-12 pb-8">
          <div className="w-full max-w-md mt-8">
            <UsernameClaimGate
              address={address}
              jwt={session.jwt}
              googleName={googleName}
              googleEmail={email}
              onClaimed={handleUsernameClaimed}
              onSkipped={handleUsernameSkipped}
            />
          </div>
        </div>
      );
    }

    return (
      <NewConversationView
        greeting={greeting}
        netWorth={balance.total}
        dailyYield={dailyYield}
        savingsRate={balance.savingsRate}
        available={balance.cash}
        earning={balance.savings}
        onSend={handleInputSubmit}
        onChipClick={handleChipClick}
        activeFlow={chipFlow.state.flow}
        prefetch={{ idleUsdc: balance.usdc, currentApy: balance.savingsRate }}
        voiceMode={{
          enabled: voiceStatus.enabled,
          state: voice.state,
          onStart: voice.start,
          onStop: voice.stop,
          interimTranscript: voice.interimTranscript,
          errorMessage: voice.errorMessage,
        }}
      />
    );
  };

  const renderChatView = () => (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 pb-4 space-y-3">

        {chipFlow.state.phase === 'result' && chipFlow.state.result && (
          <ResultCard
            success={chipFlow.state.result.success}
            title={chipFlow.state.result.title}
            details={chipFlow.state.result.details}
            txUrl={chipFlow.state.result.txUrl}
            onDismiss={chipFlow.reset}
          />
        )}

        {chipFlow.state.phase === 'confirming' && (
          <ConfirmationCard
            {...getConfirmationDetails()}
            onConfirm={handleConfirm}
            onCancel={chipFlow.reset}
            loading={chipFlow.state.flow === 'swap' && !chipFlow.state.quote}
          />
        )}

        {chipFlow.state.phase === 'executing' && (
          <ConfirmationCard
            {...getConfirmationDetails()}
            onConfirm={() => {}}
            onCancel={() => {}}
            loading
          />
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'swap' && !chipFlow.state.asset && (
          <SwapAssetPicker
            assets={getSwapFromAssets()}
            onSelect={handleSwapFromSelect}
            message={chipFlow.state.message ?? undefined}
            onCancel={chipFlow.reset}
          />
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'swap' && chipFlow.state.asset && !chipFlow.state.toAsset && (
          <SwapAssetPicker
            assets={getSwapToAssets()}
            onSelect={(sym) => chipFlow.selectToAsset(sym)}
            message={chipFlow.state.message ?? undefined}
            onCancel={chipFlow.reset}
          />
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'swap' && chipFlow.state.asset && chipFlow.state.toAsset && (
          <AmountChips
            amounts={getSwapAmountPresets()}
            allLabel={`All ${getSwapHeldAmount() >= 0.01 ? getSwapHeldAmount().toFixed(2) : getSwapHeldAmount().toPrecision(3)} ${chipFlow.state.asset}`}
            onSelect={handleSwapAmountSelect}
            message={chipFlow.state.message ?? undefined}
            assetLabel={chipFlow.state.asset}
            onChangeUpstream={() => chipFlow.clearToAsset()}
            changeUpstreamLabel={`Change target (${chipFlow.state.toAsset})`}
            onCancel={chipFlow.reset}
          />
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow && chipFlow.state.flow !== 'send' && chipFlow.state.flow !== 'swap' && (() => {
          const f = chipFlow.state.flow!;
          return (
            <AmountChips
              amounts={getAmountPresets(f, balance)}
              allLabel={
                f === 'withdraw' ? `All $${fmtDollar(balance.savings)}` :
                f === 'save' ? `All $${fmtDollar(balance.usdc)}` :
                f === 'repay' ? `All $${fmtDollar(balance.borrows)}` :
                f === 'borrow' && balance.maxBorrow > 0 ? `Max $${fmtDollar(balance.maxBorrow)}` :
                undefined
              }
              onSelect={handleAmountSelect}
              message={chipFlow.state.message ?? undefined}
              onCancel={chipFlow.reset}
            />
          );
        })()}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'send' && !chipFlow.state.recipient && (
          <SendRecipientInput
            contacts={contactsHook.contacts}
            onSelectContact={(addr, name) => chipFlow.selectRecipient(addr, name, balance.cash)}
            onSelectAudricUser={(addr, fullHandle) => chipFlow.selectRecipient(addr, fullHandle, balance.cash)}
            onSubmit={(input) => {
              void resolveAndSelectSendRecipient(input, balance.cash);
            }}
            isKnownAddress={contactsHook.isKnownAddress}
            onSaveAudricUser={contactsHook.addContact}
            onCancel={chipFlow.reset}
          />
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'send' && chipFlow.state.recipient && (
          <AmountChips
            amounts={getAmountPresets('send', balance)}
            allLabel={`All $${fmtDollar(balance.cash)}`}
            onSelect={handleAmountSelect}
            message={chipFlow.state.message ?? undefined}
            onChangeUpstream={chipFlow.clearRecipient}
            changeUpstreamLabel="Change recipient"
            onCancel={chipFlow.reset}
          />
        )}

        {!isInFlow && (
          <>
            {/* [SIMPLIFICATION DAY 3] Copilot suggestions row, email-add nudge,
                and the entire dashboard header zone (morning briefing, proactive
                banner, handled-for-you, scheduled-action proposals, upcoming
                tasks, night-before reminders, milestone goals) have all been
                removed. The chat timeline is the only surface left here. */}

            <UnifiedTimeline
              engine={engine}
              feed={feed}
              onChipClick={handleFeedChipClick}
              onCopy={handleCopy}
              onSaveContact={handleSaveContact}
              onDismissItem={feed.removeItem}
              onExecuteAction={handleExecuteAction}
              onExecuteBundle={handleExecuteBundle}
              onValidateAction={validateAction}
              agentBudget={agentBudget}
              permissionConfig={getPresetConfig(permissionPreset)}
              priceCache={(() => {
                // [v1.4 hotfix] symbol → USD price for client tier
                // resolution. SUI from the live balance, USDC/USDT pinned
                // to 1. Other assets fall through to Infinity which the
                // resolver upgrades out of the auto band — failing safe.
                const m = new Map<string, number>();
                m.set('USDC', 1);
                m.set('USDT', 1);
                if (balance.suiPrice > 0) m.set('SUI', balance.suiPrice);
                return m;
              })()}
              onSendMessage={engine.sendMessage}
              contacts={contactsHook.contacts}
              address={address}
              jwt={session?.jwt ?? null}
              sessionId={engine.sessionId ?? null}
              isKnownAddress={contactsHook.isKnownAddress}
              onPromptSaveSender={handlePromptSaveSender}
              onConfirmResolve={(approved) => {
                const resolver = confirmResolverRef.current;
                if (resolver) {
                  confirmResolverRef.current = null;
                  feed.updateLastItem((prev) => {
                    if (prev.type !== 'agent-response') return prev;
                    return { ...prev, confirm: undefined };
                  });
                  resolver(approved);
                }
              }}
            />
          </>
        )}

      </div>
      </div>

      <div className="shrink-0 max-h-[55vh] overflow-y-auto bg-surface-page safe-bottom z-30">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-3 space-y-3">
          {engine.isStreaming ? (
            <>
              <InputBar
                onSubmit={handleInputSubmit}
                onCancel={engine.cancel}
                disabled
                placeholder="Ask a follow up..."
                voiceMode={{
                  enabled: voiceStatus.enabled,
                  state: voice.state,
                  onStart: voice.start,
                  onStop: voice.stop,
                  interimTranscript: voice.interimTranscript,
                  errorMessage: voice.errorMessage,
                }}
              />
              {/* Hide the engine-cancel Stop while voice mode is active —
                  the InputBar's own "••• Stop" pill is the canonical
                  voice control, and clicking engine.cancel mid-voice
                  would resolve the awaiter with "Cancelled." text and
                  TTS-speak it. */}
              {!voice.isActive && (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={engine.cancel}
                    className="flex items-center gap-2 rounded-pill border border-border-subtle bg-transparent px-3.5 h-[30px] font-mono text-[10px] uppercase tracking-[0.1em] text-fg-secondary hover:text-fg-primary hover:border-border-strong hover:bg-surface-sunken transition active:scale-[0.97]"
                  >
                    <span aria-hidden="true" className="inline-block w-2 h-2 bg-current" /> Stop
                  </button>
                  {engine.usage && (
                    <span className="text-[10px] text-fg-muted font-mono tracking-[0.05em]">
                      {engine.usage.inputTokens + engine.usage.outputTokens} TOKENS
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div ref={chipExpand.containerRef}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-2 overflow-x-auto scrollbar-none flex-1">
                    <ChipBar
                      onChipClick={handleChipClick}
                      onPrompt={(prompt) => engine.sendMessage(prompt)}
                      activeFlow={chipFlow.state.flow}
                      disabled={chipFlow.state.phase === 'executing'}
                      prefetch={{ idleUsdc: balance.usdc, currentApy: balance.savingsRate }}
                      expandedChip={chipExpand.expandedChip}
                      onExpandedChange={chipExpand.setExpandedChip}
                    />
                  </div>
                  {isInFlow && chipFlow.state.phase !== 'result' && (
                    <button
                      type="button"
                      onClick={chipFlow.reset}
                      className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition shrink-0"
                    >
                      Cancel
                    </button>
                  )}
                  {!isInFlow && engine.messages.length > 0 && (
                    <button
                      type="button"
                      onClick={handleNewConversation}
                      className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition shrink-0"
                    >
                      New
                    </button>
                  )}
                </div>
                {chipExpand.activeConfig && chipExpand.expandedChip === 'save' && (
                  <SaveDrawer
                    prefetch={{ idleUsdc: balance.usdc, currentApy: balance.savingsRate }}
                    onSelect={(prompt) => {
                      chipExpand.close();
                      engine.sendMessage(prompt);
                    }}
                    onFlowSelect={(flow) => {
                      chipExpand.close();
                      handleChipClick(flow);
                    }}
                    onClose={chipExpand.close}
                  />
                )}
                {chipExpand.activeConfig && chipExpand.expandedChip !== 'save' && (
                  <ChipExpand
                    actions={chipExpand.activeConfig.actions}
                    chipLabel={chipExpand.activeConfig.label}
                    onSelect={(prompt) => {
                      chipExpand.close();
                      engine.sendMessage(prompt);
                    }}
                    onFlowSelect={(flow) => {
                      chipExpand.close();
                      handleChipClick(flow);
                    }}
                    onClose={chipExpand.close}
                  />
                )}
              </div>
              <InputBar
                onSubmit={handleInputSubmit}
                disabled={chipFlow.state.phase === 'executing'}
                placeholder={engine.messages.length > 0 ? 'Ask a follow up...' : 'Ask anything...'}
                voiceMode={{
                  enabled: voiceStatus.enabled,
                  state: voice.state,
                  onStart: voice.start,
                  onStop: voice.stop,
                  interimTranscript: voice.interimTranscript,
                  errorMessage: voice.errorMessage,
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );

  const panelContent = (() => {
    switch (panel) {
      case 'portfolio': {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recent = activityFeed.items.filter((i) => i.timestamp >= thirtyDaysAgo);
        return (
          <PortfolioPanel
            address={address}
            balance={balance}
            onSendMessage={(text) => {
              handleInputSubmit(text);
            }}
            activityCount={activityFeed.isLoading ? undefined : recent.length}
            activityHasMore={activityFeed.hasNextPage && recent.length === activityFeed.items.length}
          />
        );
      }
      case 'activity':
        return (
          <ActivityPanel
            feed={activityFeed}
            balance={balance}
            onAction={handleActivityAction}
            onExplainTx={handleExplainTx}
          />
        );
      case 'pay':
        return (
          <PayPanel
            address={address}
            jwt={session.jwt}
            balance={balance}
            onSendMessage={handleInputSubmit}
            onShowAddress={() => {
              setPanel('chat');
              chipFlow.reset();
              executeIntent({ action: 'address' });
            }}
          />
        );
      case 'goals':
        return session?.jwt ? (
          <GoalsPanel address={address} jwt={session.jwt} onSendMessage={handleInputSubmit} />
        ) : null;
      case 'contacts':
        return (
          <ContactsPanel
            address={address}
            balance={balance}
            feed={activityFeed}
            onSendMessage={handleInputSubmit}
          />
        );
      case 'store':
        return (
          <StorePanel
            onSendMessage={handleInputSubmit}
            address={address}
            jwt={session.jwt}
            balance={balance}
          />
        );
      case 'settings':
        return null;
      case 'chat':
      default: {
        if (greetingMounted && !engine.isStreaming) {
          return (
            <div
              className={[
                'flex-1 flex flex-col min-h-0 transition-all duration-250 ease-out',
                greetingExiting ? 'opacity-0 -translate-y-3 pointer-events-none' : 'opacity-100 translate-y-0',
              ].join(' ')}
            >
              {renderEmptyState()}
            </div>
          );
        }
        return renderChatView();
      }
    }
  })();

  const isChatLayout = panel === 'chat' || panel === undefined;

  return (
    <VoiceModeProvider
      value={{
        state: voice.state,
        speakingMessageId,
        spokenWordIndex: voice.spokenWordIndex,
        currentSpans: voice.currentSpans,
      }}
    >
      <AppShell
        address={address}
        jwt={session.jwt}
        username={userStatus.username}
        activeSessionId={engine.sessionId ?? undefined}
        onLoadSession={engine.loadSession}
        onNewConversation={handleNewConversation}
        onSearchCheckBalance={handleSearchCheckBalance}
      >
        {isChatLayout ? panelContent : (
          <div className="flex-1 overflow-y-auto">{panelContent}</div>
        )}
        {tosBanner}
      </AppShell>
    </VoiceModeProvider>
  );
}

