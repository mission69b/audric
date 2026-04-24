'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PendingActionModifiableField } from '@t2000/engine';
import type { PendingAction } from '@/lib/engine-types';
import {
  findContactByAddress,
  findNearContact,
} from '@/lib/sui-address';
import { ChunkedAddress } from './ChunkedAddress';

/**
 * [v1.4 Item 6] Single editable input rendered inside a `PermissionCard`.
 * The descriptor shape is sourced from the engine's exported
 * `PendingActionModifiableField` type so it can never drift from the
 * registry that produces it (`TOOL_MODIFIABLE_FIELDS`).
 */
interface ModifiableFieldProps {
  field: PendingActionModifiableField;
  initialValue: string | number | undefined;
  /** Approximate maximum (e.g. wallet balance) — surfaces a "~Max" hint. */
  approxMax?: number;
  onChange: (name: string, value: string | number) => void;
  disabled?: boolean;
}

function ModifiableField({
  field,
  initialValue,
  approxMax,
  onChange,
  disabled,
}: ModifiableFieldProps) {
  const [value, setValue] = useState<string>(
    initialValue === undefined || initialValue === null ? '' : String(initialValue),
  );
  const isAmount = field.kind === 'amount';

  const handleChange = (next: string) => {
    setValue(next);
    if (isAmount) {
      const num = Number(next);
      onChange(field.name, Number.isFinite(num) ? num : next);
    } else {
      onChange(field.name, next);
    }
  };

  return (
    <label className="flex flex-col gap-1 text-[11px] text-fg-secondary">
      <span className="uppercase tracking-wide">
        {field.name}
        {field.asset ? ` (${field.asset})` : ''}
      </span>
      <div className="flex items-center gap-2">
        <input
          type={isAmount ? 'number' : 'text'}
          inputMode={isAmount ? 'decimal' : 'text'}
          step={isAmount ? 'any' : undefined}
          min={isAmount ? 0 : undefined}
          value={value}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 rounded-md border border-border-subtle bg-surface-page px-2 py-1.5 text-sm font-mono text-fg-primary focus:outline-none focus:border-border-strong disabled:opacity-50"
        />
        {isAmount && approxMax !== undefined && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleChange(String(approxMax))}
            className="text-[10px] font-mono text-fg-secondary hover:text-fg-primary disabled:opacity-50"
            aria-label={`Set to maximum (~${approxMax})`}
          >
            ~Max ({approxMax})
          </button>
        )}
      </div>
    </label>
  );
}

const TOOL_LABELS: Record<string, string> = {
  save_deposit: 'Save deposit',
  withdraw: 'Withdraw',
  send_transfer: 'Send transfer',
  borrow: 'Borrow',
  repay_debt: 'Repay debt',
  claim_rewards: 'Claim rewards',
  pay_api: 'Pay for API',
  swap_execute: 'Swap',
  volo_stake: 'Stake',
  volo_unstake: 'Unstake',
};

const TIMEOUT_SEC = 60;

const COIN_TYPE_SYMBOLS: Record<string, string> = {
  '0x2::sui::SUI': 'SUI',
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': 'USDC',
  '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT': 'USDT',
  '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS': 'CETUS',
  '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP': 'DEEP',
  '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX': 'NAVX',
  '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT': 'vSUI',
  '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL': 'WAL',
  '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH': 'ETH',
};

function resolveSymbol(nameOrType: unknown): string {
  const s = String(nameOrType ?? '?');
  if (COIN_TYPE_SYMBOLS[s]) return COIN_TYPE_SYMBOLS[s];
  if (s.includes('::')) {
    const parts = s.split('::');
    return parts[parts.length - 1];
  }
  return s;
}

function formatInput(input: unknown, toolName?: string): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;

  if (toolName === 'swap_execute') {
    const from = resolveSymbol(obj.from);
    const to = resolveSymbol(obj.to);
    const amt = obj.amount ?? '?';
    return `${amt} ${from} → ${to}`;
  }
  if (toolName === 'volo_stake') {
    return `${obj.amount ?? '?'} SUI → vSUI`;
  }
  if (toolName === 'volo_unstake') {
    return obj.amount === 'all' ? 'All vSUI → SUI' : `${obj.amount ?? '?'} vSUI → SUI`;
  }

  const parts: string[] = [];
  if (obj.amount) parts.push(`$${obj.amount}`);
  if (obj.asset) parts.push(String(obj.asset));
  // For send_transfer the chunked-hex address is rendered separately
  // (see SendAddressBlock) so we deliberately skip the truncated
  // "To: 0x1234..." summary line — that truncation is exactly what
  // hid the lost-funds typo (see audric-send-safety-and-auth plan).
  if (toolName !== 'send_transfer') {
    if (obj.to) parts.push(`To: ${String(obj.to).slice(0, 8)}...`);
    if (obj.recipient) parts.push(`To: ${String(obj.recipient).slice(0, 8)}...`);
  }
  if (obj.url) parts.push(String(obj.url).replace('https://mpp.t2000.ai/', ''));
  if (obj.maxPrice) parts.push(`max $${obj.maxPrice}`);
  if (obj.memo) parts.push(`"${String(obj.memo)}"`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

type SavedContact = { name: string; address: string };

interface SendAddressBlockProps {
  to: string;
  contacts: ReadonlyArray<SavedContact>;
  walletAddress?: string | null;
  recentUserText?: string;
}

/**
 * Renders the recipient address for a `send_transfer` permission card
 * with full chunked-hex display + a one-tap copy button (so users can
 * verify against an external source without spaces leaking into the
 * clipboard), plus a source badge ("Saved contact: X" / "Address from
 * your message" / "Sending to self") and a near-contact warning when
 * the address looks like a typo of an existing contact.
 *
 * Intentional non-feature: there is NO "save as contact" inline field
 * here. The previous implementation auto-saved unnamed addresses as
 * "Wallet 1", "Wallet 2", etc., which polluted the contact list and
 * confused users (a contact appeared without them realizing). Contacts
 * are now managed exclusively from the user's contacts UI.
 */
function SendAddressBlock({
  to,
  contacts,
  walletAddress,
  recentUserText,
}: SendAddressBlockProps) {
  const normalizedTo = to.trim().toLowerCase();
  const matchedContact = useMemo(
    () => findContactByAddress(to, contacts),
    [to, contacts],
  );
  const isSelf = !!walletAddress && walletAddress.toLowerCase() === normalizedTo;
  const isVerbatimFromUser = useMemo(() => {
    if (!recentUserText) return false;
    return recentUserText.toLowerCase().includes(normalizedTo);
  }, [recentUserText, normalizedTo]);
  const nearContact = useMemo(
    () => (matchedContact ? null : findNearContact(to, contacts)),
    [to, contacts, matchedContact],
  );

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fg-secondary">
        To
      </div>
      <ChunkedAddress
        address={to}
        className="rounded-md border border-border-subtle bg-surface-page px-2.5 py-2 text-[12px] text-fg-primary"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {matchedContact && (
          <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-page px-2 py-0.5 text-[10px] font-medium text-fg-secondary">
            Saved contact: {matchedContact.name}
          </span>
        )}
        {!matchedContact && isSelf && (
          <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-page px-2 py-0.5 text-[10px] font-medium text-fg-secondary">
            Sending to your own wallet
          </span>
        )}
        {!matchedContact && !isSelf && isVerbatimFromUser && (
          <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-page px-2 py-0.5 text-[10px] font-medium text-fg-secondary">
            Address from your message
          </span>
        )}
      </div>

      {nearContact && (
        <p className="text-[11px] leading-tight text-warning-solid">
          ⚠ This is similar to but NOT the same as your saved contact
          “{nearContact.name}” (
          <span className="font-mono">
            {nearContact.address.slice(0, 6)}…{nearContact.address.slice(-4)}
          </span>
          ). Verify carefully — a single wrong character means lost funds.
        </p>
      )}
    </div>
  );
}

export type DenyReason = 'timeout' | 'denied';

/**
 * [v1.4 Item 6] Optional 4th `modifications` arg lets the user edit fields
 * declared by the engine's `tool-modifiable-fields` registry before
 * approving. `reason` retains its `DenyReason` type per the spec.
 */
interface PermissionCardProps {
  action: PendingAction;
  onResolve: (
    action: PendingAction,
    approved: boolean,
    reason?: DenyReason,
    modifications?: Record<string, unknown>,
  ) => void;
  /** Symbol → wallet balance map for the "~Max" hint on amount fields. */
  approxMaxByAsset?: Record<string, number>;
  /**
   * Saved contacts. Used to render the "Saved contact: <name>" badge,
   * the near-contact Levenshtein warning, and to compute the
   * `Wallet N` auto-name placeholder for the inline save field.
   */
  contacts?: ReadonlyArray<SavedContact>;
  /** User's own zkLogin address — surfaces a "Sending to your own
   *  wallet" badge when the recipient matches. */
  walletAddress?: string | null;
  /**
   * Concatenated text from the user's recent messages (last ~10 turns).
   * Used to render the "Address from your message" badge when the
   * recipient appears verbatim in the conversation. The engine guard
   * already enforces the same check server-side; this is purely UI.
   */
  recentUserText?: string;
}

export function PermissionCard({
  action,
  onResolve,
  approxMaxByAsset,
  contacts = [],
  walletAddress,
  recentUserText,
}: PermissionCardProps) {
  const [resolved, setResolved] = useState(false);
  const resolvedRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SEC);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const label = TOOL_LABELS[action.toolName] ?? action.toolName.replace(/_/g, ' ');

  // [v1.4 Item 6] Engine-stamped registry of fields the user can edit.
  const modifiableFields = action.modifiableFields ?? [];

  // Track edits to action.input for fields declared modifiable.
  const initialInput = useMemo(
    () => (action.input && typeof action.input === 'object'
      ? { ...(action.input as Record<string, unknown>) }
      : {}),
    [action.input],
  );
  const [modifiedInput, setModifiedInput] = useState<Record<string, unknown>>(initialInput);

  // Recompute the human-readable summary against the modified input so the
  // user sees the new amount before clicking "Approve".
  const inputSummary = formatInput(modifiedInput, action.toolName);

  const sendTo = useMemo(() => {
    if (action.toolName !== 'send_transfer') return null;
    const raw = (modifiedInput as Record<string, unknown>).to;
    return typeof raw === 'string' ? raw : null;
  }, [action.toolName, modifiedInput]);

  const handleFieldChange = (name: string, value: string | number) => {
    setModifiedInput((prev) => ({ ...prev, [name]: value }));
  };

  const handle = async (approved: boolean, reason?: DenyReason) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setResolved(true);
    if (timerRef.current) clearInterval(timerRef.current);

    // Only forward modifications when the user actually changed a value
    // declared as modifiable. Comparing `String(...)` keeps numeric vs string
    // edits aligned with how the input was displayed.
    let modifications: Record<string, unknown> | undefined;
    if (approved && modifiableFields.length) {
      const diff: Record<string, unknown> = {};
      for (const f of modifiableFields) {
        const before = (initialInput as Record<string, unknown>)[f.name];
        const after = modifiedInput[f.name];
        if (String(before ?? '') !== String(after ?? '')) {
          diff[f.name] = after;
        }
      }
      if (Object.keys(diff).length > 0) modifications = diff;
    }

    onResolve(action, approved, reason, modifications);
  };

  useEffect(() => {
    if (resolved) return;

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          handle(false, 'timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  const progress = secondsLeft / TIMEOUT_SEC;

  return (
    <div
      className="rounded-xl border border-border-subtle bg-surface-card p-3 space-y-2.5 shadow-[var(--shadow-flat)]"
      role="alertdialog"
      aria-label={`Confirm ${label}`}
      aria-describedby={`perm-desc-${action.toolUseId}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-primary">{label}</span>
        {!resolved && (
          <span
            className={`text-[10px] font-mono tabular-nums ${secondsLeft <= 10 ? 'text-error-solid' : 'text-fg-secondary'}`}
            aria-label={`${secondsLeft} seconds remaining`}
          >
            {secondsLeft}s
          </span>
        )}
      </div>

      {!resolved && (
        <div className="h-0.5 w-full bg-border-subtle rounded-full overflow-hidden">
          <div
            className="h-full bg-fg-primary rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {action.description && (
        <p className="text-xs text-fg-secondary" id={`perm-desc-${action.toolUseId}`}>{action.description}</p>
      )}

      {inputSummary && (
        <p className="text-sm font-mono text-fg-primary">{inputSummary}</p>
      )}

      {sendTo && (
        <SendAddressBlock
          to={sendTo}
          contacts={contacts}
          walletAddress={walletAddress}
          recentUserText={recentUserText}
        />
      )}

      {!resolved && modifiableFields.length > 0 && (
        <div className="space-y-2 rounded-md border border-border-subtle bg-surface-page p-2">
          {modifiableFields.map((field) => (
            <ModifiableField
              key={field.name}
              field={field}
              initialValue={(initialInput as Record<string, unknown>)[field.name] as
                | string
                | number
                | undefined}
              approxMax={field.asset ? approxMaxByAsset?.[field.asset] : undefined}
              onChange={handleFieldChange}
              disabled={resolved}
            />
          ))}
        </div>
      )}

      {action.guardInjections && action.guardInjections.length > 0 && (
        <div className="space-y-1">
          {action.guardInjections.map((g, i) => (
            <p
              key={i}
              className={`text-[11px] leading-tight ${g._warning ? 'text-warning-solid' : 'text-fg-secondary'}`}
            >
              {g._warning ?? g._hint}
            </p>
          ))}
        </div>
      )}

      {!resolved ? (
        <div className="flex gap-2">
          <button
            onClick={() => handle(false, 'denied')}
            className="flex-1 rounded-lg border border-border-subtle bg-surface-page py-2 text-xs font-medium text-fg-secondary hover:text-fg-primary hover:border-border-strong transition active:scale-[0.97]"
          >
            Deny
          </button>
          <button
            onClick={() => handle(true)}
            className="flex-1 rounded-lg bg-fg-primary py-2 text-xs font-semibold text-fg-inverse transition hover:opacity-90 active:scale-[0.97]"
          >
            Approve
          </button>
        </div>
      ) : (
        <div className="text-xs text-fg-secondary text-center py-1">Processing...</div>
      )}
    </div>
  );
}
