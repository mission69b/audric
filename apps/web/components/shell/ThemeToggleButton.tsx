'use client';

/**
 * Sidebar-footer theme toggle.
 *
 * One icon button that cycles the user's stored theme choice in
 * `light → dark → system → light` order on click. Sits next to the
 * user avatar in both collapsed and expanded sidebar layouts.
 *
 * What this button shows is the user's STORED choice (`theme` from
 * `useTheme()`), NOT the currently-applied theme (`resolvedTheme`).
 * That is the difference between "I asked for system" and "the
 * system is currently dark" — clicking the button should always
 * progress through the user's three options, even if `system`
 * happens to currently render the same as a hard-coded `dark`.
 *
 * Icons:
 *   - light  → SunIcon
 *   - dark   → MoonIcon
 *   - system → MonitorIcon
 *
 * Tooltip text follows the same intent: "Theme: Light · Switch to
 * Dark", so the user knows both where they are and what comes next.
 *
 * The button itself is identical in both sidebar variants — same
 * 32px hit target, same hover treatment as other collapsed-footer
 * icons. The parent layout decides whether it sits in a vertical
 * column (collapsed) or horizontal row (expanded next to the
 * user-info button).
 */

import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTheme, type Theme } from '@/components/providers/ThemeProvider';
import type { IconName } from '@/lib/icons';

const NEXT_THEME: Record<Theme, Theme> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const ICON_FOR_THEME: Record<Theme, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
};

const LABEL_FOR_THEME: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

interface ThemeToggleButtonProps {
  /** Tooltip placement. Defaults to 'right' (matches other sidebar buttons). */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export function ThemeToggleButton({ tooltipSide = 'right' }: ThemeToggleButtonProps = {}) {
  const { theme, setTheme } = useTheme();
  const next = NEXT_THEME[theme];
  const tooltip = `Theme: ${LABEL_FOR_THEME[theme]} · Switch to ${LABEL_FOR_THEME[next]}`;

  return (
    <Tooltip label={tooltip} side={tooltipSide}>
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={tooltip}
        className={[
          'inline-flex items-center justify-center w-8 h-8 rounded-sm text-fg-muted',
          'hover:text-fg-primary hover:bg-surface-card transition-colors',
          'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
        ].join(' ')}
      >
        <Icon name={ICON_FOR_THEME[theme]} size={16} />
      </button>
    </Tooltip>
  );
}
