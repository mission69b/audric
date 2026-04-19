import { ICONS, type IconName } from '@/lib/icons';

export interface IconProps {
  name: IconName;
  /** Pixel size — applied to width and height. Defaults to 16. */
  size?: number;
  className?: string;
  /** Standalone icons should set this for screen readers; decorative icons leave undefined and are aria-hidden. */
  'aria-label'?: string;
}

export function Icon({ name, size = 16, className, 'aria-label': ariaLabel }: IconProps) {
  const SvgComponent = ICONS[name];
  if (!SvgComponent) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Icon] Unknown icon name: "${name}"`);
    }
    return null;
  }

  const a11y = ariaLabel
    ? { role: 'img' as const, 'aria-label': ariaLabel }
    : { 'aria-hidden': true as const, focusable: false as const };

  return (
    <SvgComponent
      width={size}
      height={size}
      className={className}
      {...a11y}
    />
  );
}
