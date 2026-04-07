'use client';

export type DashboardTab = 'chat' | 'activity';

interface DashboardTabsProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  hasUnread?: boolean;
}

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'activity', label: 'Activity' },
];

export function DashboardTabs({ activeTab, onTabChange, hasUnread }: DashboardTabsProps) {
  return (
    <div className="flex gap-1 border-b border-border" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`relative px-4 py-2.5 text-xs font-mono uppercase tracking-[0.1em] transition-colors ${
            activeTab === tab.id
              ? 'text-foreground border-b-2 border-foreground -mb-px'
              : 'text-muted hover:text-foreground'
          }`}
        >
          {tab.label}
          {tab.id === 'activity' && hasUnread && (
            <span className="absolute top-2 -right-0.5 w-1.5 h-1.5 rounded-full bg-info" />
          )}
        </button>
      ))}
    </div>
  );
}
