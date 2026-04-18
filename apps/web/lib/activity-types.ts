export interface ActivityItem {
  id: string;
  source: 'chain' | 'app';
  type: string;
  title: string;
  subtitle?: string;
  amount?: number;
  asset?: string;
  direction?: 'in' | 'out' | 'self';
  counterparty?: string;
  digest?: string;
  timestamp: number;
  paymentMethod?: string;
}

// [SIMPLIFICATION DAY 12.5] Removed `follow_up` + `schedule` filter variants
// (no chip exposes them, no event source emits them, autonomy stack retired).
// `autonomous` stays — ActivityCard still flags onchain auto-actions if a
// future surface re-introduces the concept; the chip exists in ACTIVITY_FILTERS.
export type ActivityFilter =
  | 'all'
  | 'savings'
  | 'send'
  | 'receive'
  | 'swap'
  | 'pay'
  | 'store'
  | 'autonomous';

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'savings', label: 'Savings' },
  { id: 'send', label: 'Send' },
  { id: 'swap', label: 'Swap' },
  { id: 'pay', label: 'Pay' },
  { id: 'store', label: 'Store' },
  { id: 'autonomous', label: 'Autonomous' },
];

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
  network: string;
}
