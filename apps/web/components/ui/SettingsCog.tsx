'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';

interface SettingsCogProps {
  className?: string;
}

/**
 * Top-right cog used by the app shell to enter Settings. Hidden when the
 * user is already on `/settings`. Visual: 32×32 square, 4px radius,
 * `border-border-strong`, `bg-surface-card`. Lifted from `app.jsx`
 * design reference (line 26).
 */
export function SettingsCog({ className }: SettingsCogProps) {
  const pathname = usePathname();
  if (pathname?.startsWith('/settings')) return null;

  return (
    <Tooltip label="Settings">
      <Link
        href="/settings"
        aria-label="Settings"
        className={[
          'inline-flex items-center justify-center w-8 h-8 rounded-sm',
          'border border-border-strong bg-surface-card text-fg-muted',
          'hover:text-fg-primary hover:border-fg-primary transition-colors',
          'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Icon name="settings" size={15} />
      </Link>
    </Tooltip>
  );
}
