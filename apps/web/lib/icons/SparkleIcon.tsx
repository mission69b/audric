import type { SVGProps } from 'react';

export const SparkleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    {...props}
  >
    <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4.5 4.5l1.75 1.75M9.75 9.75 11.5 11.5M4.5 11.5l1.75-1.75M9.75 6.25 11.5 4.5"></path>
  </svg>
);
