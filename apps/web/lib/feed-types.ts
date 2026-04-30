export type FeedItemType =
  | 'user-message'
  | 'ai-text'
  | 'confirmation'
  | 'result'
  | 'receipt'
  | 'list'
  | 'report'
  | 'image'
  | 'audio'
  | 'error'
  | 'contact-prompt'
  | 'transaction-history'
  | 'agent-response';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  timestamp: number;
  data: FeedItemData;
}

export type FeedItemData =
  | { type: 'user-message'; text: string }
  | { type: 'ai-text'; text: string; chips?: { label: string; flow: string }[] }
  | { type: 'confirmation'; title: string; details: { label: string; value: string }[]; flow: string; amount?: number }
  | { type: 'result'; success: boolean; title: string; details: string; txUrl?: string }
  | {
      type: 'receipt';
      title: string;
      /** Human-readable code shown beneath the QR (rendered via CopyableCode). */
      code?: string;
      qr?: boolean;
      /**
       * Optional override for the QR payload. When set, the QR encodes this
       * value instead of `code`. Used by the receive flow to encode a
       * `sui:pay?recipient=…&coinType=…` deep-link URI so phone-camera scans
       * open Slush / Phantom / Suiet directly with the address pre-filled,
       * while the copyable text below still shows the bare 0x address for
       * CEX-withdrawal pasting. Without this split, the QR and the copyable
       * text were forced to be the same string — opening Slush required
       * encoding the URI in `code`, which then made the copyable show
       * "sui:pay?recipient=0x..." gibberish.
       */
      qrUri?: string;
      meta: { label: string; value: string }[];
      instructions?: { title: string; steps: string[] }[];
    }
  | { type: 'list'; title: string; items: { label: string; value: string; sub?: string }[] }
  | { type: 'report'; sections: { title: string; lines: string[] }[] }
  | { type: 'image'; url: string; alt: string; cost?: string }
  | { type: 'audio'; url: string; title: string; cost?: string }
  | { type: 'error'; message: string; chips?: { label: string; flow: string }[] }
  | { type: 'contact-prompt'; address: string }
  | { type: 'transaction-history'; transactions: TxHistoryEntry[]; network: string }
  | { type: 'agent-response'; steps: AgentStepData[]; text?: string; totalCost?: number; status: 'running' | 'done' | 'error'; error?: string; confirm?: { tool: string; cost: number; summary?: string } };

export interface AgentStepData {
  tool: string;
  status: 'running' | 'done' | 'error';
  cost?: number;
  error?: string;
}

export interface TxHistoryEntry {
  digest: string;
  /** Coarse bucket: send / lending / swap / transaction. */
  action: string;
  /**
   * [v1.5.3] Finer-grained label from engine ≥ 0.45.0
   * (deposit, withdraw, borrow, repay, payment_link, on-chain, …).
   * Display logic should prefer this over `action` when present.
   */
  label?: string;
  direction: 'out' | 'in' | 'self';
  amount?: number;
  asset?: string;
  counterparty?: string;
  timestamp: number;
}

let nextId = 0;
export function createFeedItem(data: FeedItemData): FeedItem {
  return {
    id: `feed-${Date.now()}-${nextId++}`,
    type: data.type,
    timestamp: Date.now(),
    data,
  };
}
