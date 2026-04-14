import { useState, useEffect, useRef, useCallback } from 'react';
import { buildChipConfigs, type ChipConfig, type ChipPrefetchData } from '@/lib/chip-configs';

export function useChipExpand(prefetch?: ChipPrefetchData) {
  const [expandedChip, setExpandedChip] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const configs = buildChipConfigs(prefetch);

  const activeConfig: ChipConfig | null =
    expandedChip ? configs.find((c) => c.id === expandedChip) ?? null : null;

  useEffect(() => {
    if (!expandedChip) return;

    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpandedChip(null);
      }
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [expandedChip]);

  const close = useCallback(() => setExpandedChip(null), []);

  return { expandedChip, setExpandedChip, containerRef, activeConfig, close };
}
