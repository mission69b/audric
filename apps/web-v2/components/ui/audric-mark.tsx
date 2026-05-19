"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * AudricMark — the 9-cell diamond brand mark, ported verbatim from
 * `audric/apps/web/components/ui/AudricMark.tsx` for the Phase 6 Store
 * rebuild (Session 3, v0.7c).
 */

interface AudricMarkProps {
  size?: number;
  animate?: boolean;
  className?: string;
}

const GRID: [number, number][] = [
  [0, 2],
  [1, 1],
  [1, 3],
  [2, 0],
  [2, 2],
  [2, 4],
  [3, 1],
  [3, 3],
  [4, 2],
];

export function AudricMark({
  size = 24,
  animate = false,
  className = "",
}: AudricMarkProps) {
  const rectsRef = useRef<(SVGRectElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const runPulse = useCallback(() => {
    const rects = rectsRef.current.filter(Boolean) as SVGRectElement[];
    if (rects.length === 0) {
      return;
    }

    const center = Math.floor(GRID.length / 2);
    for (const [i, rect] of rects.entries()) {
      const dist = Math.abs(i - center);
      rect.style.transition = "none";
      rect.style.opacity = "0.15";

      setTimeout(() => {
        rect.style.transition = "opacity 0.35s ease-out";
        rect.style.opacity = "1";
      }, dist * 80);
    }

    timerRef.current = setTimeout(runPulse, GRID.length * 80 + 400);
  }, []);

  useEffect(() => {
    if (!animate) {
      return;
    }
    runPulse();
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [animate, runPulse]);

  const viewBox = 512;
  const cellSize = 56;
  const gap = 68;
  const offset = 92;

  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      width={size}
    >
      <title>Audric</title>
      {GRID.map(([row, col], i) => (
        <rect
          fill="currentColor"
          height={cellSize}
          key={`${row}-${col}`}
          ref={(el) => {
            rectsRef.current[i] = el;
          }}
          rx={8}
          ry={8}
          width={cellSize}
          x={offset + col * gap}
          y={offset + row * gap}
        />
      ))}
    </svg>
  );
}
