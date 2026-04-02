'use client';

import { AudricMark } from '@/components/ui/AudricMark';
import { Spinner } from '@/components/ui/Spinner';

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

const ANIMATED_STATES = new Set<ThinkingStatus>(['thinking', 'priming', 'delivering', 'awakening']);

export function ThinkingState({ status, intensity = 'active' }: ThinkingStateProps) {
  const config = STATE_CONFIG[status];
  const opacityClass = INTENSITY_OPACITY[intensity];
  const isAnimated = ANIMATED_STATES.has(status);

  return (
    <div
      className={`inline-flex items-center gap-2 py-1.5 ${opacityClass} transition-opacity duration-300`}
      role="status"
      aria-label={config.label}
    >
      {isAnimated ? (
        status === 'awakening' || status === 'priming' ? (
          <Spinner size="sm" />
        ) : (
          <AudricMark size={16} animate className="text-foreground" />
        )
      ) : (
        <span className="text-sm leading-none" aria-hidden="true">
          {config.icon}
        </span>
      )}
      <span className="font-mono text-xs tracking-wider uppercase text-dim">
        {config.label}
      </span>
    </div>
  );
}
