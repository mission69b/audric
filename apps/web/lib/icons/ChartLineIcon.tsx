import type { SVGProps } from 'react';

export const ChartLineIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    {...props}
  >
    <path d="M 1.335 13 L 4.53 7 L 8.18 10.245 C 8.294 10.347 8.43 10.421 8.578 10.461 C 8.725 10.502 8.88 10.508 9.03 10.48 C 9.182 10.452 9.325 10.389 9.448 10.296 C 9.571 10.203 9.671 10.083 9.74 9.945 L 12.5 4.45 L 11.59 4 L 8.845 9.5 L 5.195 6.255 C 5.084 6.151 4.95 6.075 4.804 6.03 C 4.659 5.986 4.505 5.976 4.355 6 C 4.207 6.025 4.066 6.082 3.943 6.169 C 3.82 6.255 3.718 6.369 3.645 6.5 L 1 11.5 L 1 0 L 0 0 L 0 13 C 0 13.265 0.105 13.52 0.293 13.707 C 0.48 13.895 0.735 14 1 14 L 14 14 L 14 13 L 1.335 13 Z" fill="currentColor" fillRule="nonzero"/>
  </svg>
);
