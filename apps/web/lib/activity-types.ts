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

export type ActivityFilter = 'all' | 'savings' | 'send' | 'receive' | 'swap' | 'pay' | 'follow_up' | 'schedule';

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'savings', label: 'Savings' },
  { id: 'send', label: 'Send' },
  { id: 'receive', label: 'Receive' },
  { id: 'swap', label: 'Swap' },
  { id: 'pay', label: 'Pay' },
  { id: 'follow_up', label: 'Follow-ups' },
  { id: 'schedule', label: 'Schedules' },
];

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
  network: string;
}
