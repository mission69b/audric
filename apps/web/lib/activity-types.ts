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
}

export type ActivityFilter = 'all' | 'savings' | 'send' | 'receive' | 'swap' | 'pay' | 'store' | 'autonomous' | 'follow_up' | 'schedule';

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
