'use client';

export type ThinkingStatus =
  | 'awakening'
  | 'thinking'
  | 'priming'
  | 'delivering'
  | 'interrupted'
  | 'failed'
  | 'timed_out'
  | 'queued';

export type ThinkingIntensity = 'active' | 'transitioning' | 'idle';

interface ThinkingStateProps {
  status: ThinkingStatus;
  intensity?: ThinkingIntensity;
}

const STATE_CONFIG: Record<ThinkingStatus, { icon: string; label: string }> = {
  awakening:   { icon: '✦', label: 'AWAKENING' },
  thinking:    { icon: '🧠', label: 'THINKING' },
  priming:     { icon: '⊞', label: 'PRIMING' },
  delivering:  { icon: '◈', label: 'DELIVERING' },
  interrupted: { icon: '⊘', label: 'INTERRUPTED' },
  failed:      { icon: '△', label: 'FAILED' },
  timed_out:   { icon: '⊙', label: 'TIMED OUT' },
  queued:      { icon: '≋', label: 'QUEUED' },
};

const INTENSITY_OPACITY: Record<ThinkingIntensity, string> = {
  active: 'opacity-100',
  transitioning: 'opacity-60',
  idle: 'opacity-30',
};

export function ThinkingState({ status, intensity = 'active' }: ThinkingStateProps) {
  const config = STATE_CONFIG[status];
  const opacityClass = INTENSITY_OPACITY[intensity];

  const isAnimated = status === 'thinking' || status === 'priming' || status === 'delivering';

  return (
    <div
      className={`inline-flex items-center gap-2 py-1.5 ${opacityClass} transition-opacity duration-300`}
      role="status"
      aria-label={config.label}
    >
      <span className={`text-sm leading-none ${isAnimated ? 'animate-pulse' : ''}`} aria-hidden="true">
        {config.icon}
      </span>
      <span className="font-mono text-xs tracking-wider uppercase text-dim">
        {config.label}
      </span>
    </div>
  );
}
