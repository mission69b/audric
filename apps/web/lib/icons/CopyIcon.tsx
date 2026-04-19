import type { SVGProps } from 'react';

export const CopyIcon = (props: SVGProps<SVGSVGElement>) => (
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
    <rect x="5" y="5" width="8.5" height="8.5" rx="1"></rect><path d="M3 10.5V3a.5.5 0 0 1 .5-.5H11"></path>
  </svg>
);
