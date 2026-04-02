'use client';

import { useEffect, useRef, useCallback } from 'react';

interface AudricMarkProps {
  size?: number;
  animate?: boolean;
  className?: string;
}

const GRID: [number, number][] = [
  [0, 2],
  [1, 1], [1, 3],
  [2, 0], [2, 2], [2, 4],
  [3, 1], [3, 3],
  [4, 2],
];

export function AudricMark({ size = 24, animate = false, className = '' }: AudricMarkProps) {
  const rectsRef = useRef<(SVGRectElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const runPulse = useCallback(() => {
    const rects = rectsRef.current.filter(Boolean) as SVGRectElement[];
    if (rects.length === 0) return;

    const center = Math.floor(GRID.length / 2);
    rects.forEach((rect, i) => {
      const dist = Math.abs(i - center);
      rect.style.transition = 'none';
      rect.style.opacity = '0.15';

      setTimeout(() => {
        rect.style.transition = 'opacity 0.35s ease-out';
        rect.style.opacity = '1';
      }, dist * 80);
    });

    timerRef.current = setTimeout(runPulse, GRID.length * 80 + 400);
  }, []);

  useEffect(() => {
    if (!animate) return;
    runPulse();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [animate, runPulse]);

  const viewBox = 512;
  const cellSize = 56;
  const gap = 68;
  const offset = 92;

  return (
    <svg
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {GRID.map(([row, col], i) => (
        <rect
          key={`${row}-${col}`}
          ref={el => { rectsRef.current[i] = el; }}
          x={offset + col * gap}
          y={offset + row * gap}
          width={cellSize}
          height={cellSize}
          rx={8}
          ry={8}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
